/* ============================================================================
 * Techno-Kol ERP — Document Diff Engine (DocDiff)
 * Agent Y-117 / Swarm Office Docs / Mega-ERP Kobi EL 2026
 * ----------------------------------------------------------------------------
 * מנוע השוואת גרסאות מסמכים — מפעל מתכת "טכנו-קול עוזי"
 *
 * Purpose (תכלית):
 *   Structured, zero-dependency comparison of two document versions at
 *   line / word / character / section granularity, with bilingual RTL
 *   output. Complements Agent Y-106 (Document Version Control) by
 *   explaining *what* changed between any two revisions.
 *
 *   Used by:
 *     • Contracts (חוזים) — redline review before legal approval
 *     • Policies (נהלים) — change tracking for compliance audits
 *     • Marketing collateral (חומרי שיווק) — bilingual copy diffs
 *     • Quotes & proposals (הצעות מחיר) — pre-send sanity check
 *     • Internal memos (מזכרים) — forward-merge conflict resolution
 *
 * RULES (immutable, inherited from the ERP charter):
 *   לא מוחקים רק משדרגים ומגדלים
 *   → No deletion semantics; "delete" ops in a diff are DESCRIPTIVE markers,
 *     not destructive instructions. The underlying documents are immutable.
 *   → Zero external dependencies — Node built-ins only.
 *   → Hebrew RTL + bilingual labels on every public structure.
 *   → Must handle Hebrew text correctly: RTL order, nikkud (ניקוד) combining
 *     marks, and final letters (אותיות סופיות — ך ם ן ף ץ).
 *   → Mixed Hebrew + English + digits on the same line must diff correctly.
 *
 * Algorithms:
 *   • Myers O(ND) diff (Eugene Myers, 1986) — line and token level
 *   • Levenshtein edit distance (Wagner-Fischer DP) — similarity score
 *   • Two-way merge via LCS from base — 3-way merge with conflict markers
 *
 * Storage:
 *   Pure functions. The `DocDiff` class holds NO instance state — it is a
 *   namespace container so consumers can `new DocDiff().diffLines(...)` or
 *   equivalently `DocDiff.diffLines(...)`. Both styles are supported.
 * ========================================================================== */

'use strict';

/* ----------------------------------------------------------------------------
 * 0. Bilingual constants — frozen catalogs
 * -------------------------------------------------------------------------- */

/** @enum Diff operation kinds. */
const DIFF_OPS = Object.freeze({
  equal:  Object.freeze({ id: 'equal',  he: 'ללא שינוי', en: 'Unchanged', sign: ' ' }),
  insert: Object.freeze({ id: 'insert', he: 'נוסף',       en: 'Inserted',  sign: '+' }),
  delete: Object.freeze({ id: 'delete', he: 'נמחק',       en: 'Deleted',   sign: '-' }),
});

/** @enum 3-way merge outcome kinds. */
const MERGE_KINDS = Object.freeze({
  clean:    Object.freeze({ id: 'clean',    he: 'ממוזג נקי',      en: 'Clean merge' }),
  conflict: Object.freeze({ id: 'conflict', he: 'התנגשות',        en: 'Conflict' }),
});

/** Bilingual labels shared across formatters. */
const LABELS = Object.freeze({
  summaryTitle:      { he: 'סיכום השוואה',         en: 'Diff summary' },
  inserted:          { he: 'נוספו',                 en: 'Insertions' },
  deleted:           { he: 'נמחקו',                 en: 'Deletions' },
  unchanged:         { he: 'ללא שינוי',             en: 'Unchanged' },
  pctChanged:        { he: 'אחוז שינוי',            en: 'Percent changed' },
  totalLines:        { he: 'סך שורות',              en: 'Total lines' },
  similarityTitle:   { he: 'ציון דמיון',            en: 'Similarity score' },
  conflictStart:     { he: '<<<<<<< סניף א׳',       en: '<<<<<<< Branch A' },
  conflictBase:      { he: '||||||| בסיס משותף',    en: '||||||| Base' },
  conflictMid:       { he: '=======',                en: '=======' },
  conflictEnd:       { he: '>>>>>>> סניף ב׳',       en: '>>>>>>> Branch B' },
  diffReportTitle:   { he: 'דוח השוואת מסמכים',     en: 'Document diff report' },
});

/* Unicode ranges we care about for segmentation:
 *   Hebrew letters      U+0590..U+05FF
 *   Hebrew presentation U+FB1D..U+FB4F
 *   Arabic (just in case) U+0600..U+06FF
 * Nikkud (combining marks) live inside U+0591..U+05C7 and are attached to
 * their base letter — we never split a nikkud off its base. */
const HEBREW_RE = /[\u0590-\u05FF\uFB1D-\uFB4F]/;

/* HTML escape table — the only escape we do. No innerHTML ever sees unescaped
 * user text. */
const HTML_ESCAPE_MAP = Object.freeze({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
});

/* ----------------------------------------------------------------------------
 * 1. Pure helpers (module-private)
 * -------------------------------------------------------------------------- */

/**
 * Escape a string so it is safe to embed as HTML text.
 * Zero-dep, deterministic. Covers the OWASP base-5 set.
 * @param {string} s
 * @returns {string}
 */
function escapeHtml(s) {
  if (s === null || s === undefined) return '';
  return String(s).replace(/[&<>"']/g, (ch) => HTML_ESCAPE_MAP[ch]);
}

/**
 * Split text into lines, preserving an empty trailing string only when the
 * input ends with a newline AND the caller cares. We keep empty lines in
 * the middle but drop a single trailing empty produced by a final '\n'.
 * @param {string} text
 * @returns {string[]}
 */
function splitLines(text) {
  if (text === null || text === undefined || text === '') return [];
  const s = String(text);
  // Normalise CRLF and lone CR to LF so cross-OS docs diff identically.
  const norm = s.replace(/\r\n?/g, '\n');
  const parts = norm.split('\n');
  // If the input ended with '\n', split gives us a spurious trailing ''.
  if (parts.length > 0 && parts[parts.length - 1] === '' && norm.endsWith('\n')) {
    parts.pop();
  }
  return parts;
}

/**
 * Split a single line into words while keeping whitespace runs as their own
 * tokens. This is critical for Hebrew: we cannot naively split on /\s+/ and
 * rejoin with ' ' — that would destroy multiple-space alignment used in
 * bilingual tables. We preserve every character.
 *
 * A "word" token is a maximal run of non-whitespace characters. A "gap"
 * token is a maximal run of whitespace. Nikkud marks stay attached to
 * their base letter because they are non-whitespace.
 *
 * @param {string} line
 * @returns {string[]}
 */
function splitWords(line) {
  if (line === null || line === undefined || line === '') return [];
  const s = String(line);
  const tokens = [];
  let i = 0;
  const len = s.length;
  while (i < len) {
    const ch = s[i];
    const isSpace = ch === ' ' || ch === '\t' || ch === '\u00A0';
    let j = i + 1;
    if (isSpace) {
      while (j < len) {
        const cj = s[j];
        if (cj === ' ' || cj === '\t' || cj === '\u00A0') j += 1;
        else break;
      }
    } else {
      while (j < len) {
        const cj = s[j];
        if (cj === ' ' || cj === '\t' || cj === '\u00A0') break;
        j += 1;
      }
    }
    tokens.push(s.slice(i, j));
    i = j;
  }
  return tokens;
}

/**
 * Split text into a character array, but keep each base character glued to
 * any combining marks that follow it. This matters for Hebrew nikkud:
 * the letter ב followed by the dagesh U+05BC should count as ONE unit in
 * a char-level diff so that toggling nikkud does not create phantom
 * insertions on every character. We treat U+0591..U+05C7 and U+FB1E as
 * combining marks.
 *
 * @param {string} text
 * @returns {string[]}
 */
function splitChars(text) {
  if (text === null || text === undefined || text === '') return [];
  const s = String(text);
  const out = [];
  let i = 0;
  const len = s.length;
  while (i < len) {
    let j = i + 1;
    // Grab any trailing combining marks (Hebrew nikkud / cantillation / dagesh).
    while (j < len) {
      const code = s.charCodeAt(j);
      const isHebrewCombining =
        (code >= 0x0591 && code <= 0x05C7) || code === 0xFB1E;
      if (!isHebrewCombining) break;
      j += 1;
    }
    out.push(s.slice(i, j));
    i = j;
  }
  return out;
}

/**
 * Determine whether a string contains any Hebrew characters.
 * @param {string} s
 * @returns {boolean}
 */
function hasHebrew(s) {
  if (s === null || s === undefined || s === '') return false;
  return HEBREW_RE.test(String(s));
}

/**
 * Myers O(ND) diff over two token arrays.
 *
 * This is the canonical "An O(ND) Difference Algorithm" by Eugene Myers
 * (1986). We compute the edit-script trace and then walk it backward to
 * emit operations in forward order.
 *
 * Equality is defined by strict `===` on array elements, so this works
 * for strings (line diff), tokens (word diff), and grapheme clusters
 * (char diff) alike.
 *
 * @template T
 * @param {T[]} a
 * @param {T[]} b
 * @returns {Array<{op:'equal'|'insert'|'delete', value:T, aIdx?:number, bIdx?:number}>}
 */
function myersDiff(a, b) {
  const N = a.length;
  const M = b.length;
  const MAX = N + M;

  // Fast paths.
  if (N === 0 && M === 0) return [];
  if (N === 0) {
    return b.map((v, i) => ({ op: 'insert', value: v, bIdx: i }));
  }
  if (M === 0) {
    return a.map((v, i) => ({ op: 'delete', value: v, aIdx: i }));
  }

  // V[k + MAX] holds the furthest-reaching x for diagonal k at current D.
  // We snapshot V per D so we can walk backward once we find the endpoint.
  // To save memory we store only the V's we actually need.
  const trace = [];
  const vSize = 2 * MAX + 1;
  const offset = MAX;
  let V = new Int32Array(vSize);

  let reachedD = -1;
  for (let D = 0; D <= MAX; D += 1) {
    // Snapshot V BEFORE this D's writes so we can replay it during
    // backtracking. We copy, not reference.
    const snapshot = new Int32Array(V);
    trace.push(snapshot);

    for (let k = -D; k <= D; k += 2) {
      let x;
      if (k === -D) {
        x = V[k + 1 + offset];
      } else if (k === D) {
        x = V[k - 1 + offset] + 1;
      } else {
        const down = V[k + 1 + offset];
        const right = V[k - 1 + offset] + 1;
        x = down > right ? down : right;
      }
      let y = x - k;
      // Follow snake of equal elements.
      while (x < N && y < M && a[x] === b[y]) {
        x += 1;
        y += 1;
      }
      V[k + offset] = x;
      if (x >= N && y >= M) {
        reachedD = D;
        break;
      }
    }
    if (reachedD !== -1) break;
  }

  // Backtrack through snapshots to reconstruct the edit path.
  const path = []; // each entry: {x, y} — grid points visited in reverse.
  let x = N;
  let y = M;
  for (let D = reachedD; D > 0; D -= 1) {
    const Vprev = trace[D];
    const k = x - y;
    let prevK;
    if (k === -D) {
      prevK = k + 1;
    } else if (k === D) {
      prevK = k - 1;
    } else {
      const down = Vprev[k + 1 + offset];
      const right = Vprev[k - 1 + offset] + 1;
      prevK = down > right ? k + 1 : k - 1;
    }
    const prevX = Vprev[prevK + offset];
    const prevY = prevX - prevK;
    // Walk back the diagonal snake first.
    while (x > prevX && y > prevY) {
      path.push({ fromX: x - 1, fromY: y - 1, toX: x, toY: y, diag: true });
      x -= 1;
      y -= 1;
    }
    if (D > 0) {
      path.push({ fromX: prevX, fromY: prevY, toX: x, toY: y, diag: false });
    }
    x = prevX;
    y = prevY;
  }
  // Finally walk any remaining initial diagonal.
  while (x > 0 && y > 0 && a[x - 1] === b[y - 1]) {
    path.push({ fromX: x - 1, fromY: y - 1, toX: x, toY: y, diag: true });
    x -= 1;
    y -= 1;
  }

  path.reverse();
  const ops = [];
  for (const step of path) {
    if (step.diag) {
      ops.push({
        op: 'equal',
        value: a[step.fromX],
        aIdx: step.fromX,
        bIdx: step.fromY,
      });
    } else if (step.toX > step.fromX && step.toY === step.fromY) {
      ops.push({ op: 'delete', value: a[step.fromX], aIdx: step.fromX });
    } else if (step.toY > step.fromY && step.toX === step.fromX) {
      ops.push({ op: 'insert', value: b[step.fromY], bIdx: step.fromY });
    }
  }
  return ops;
}

/**
 * Levenshtein edit distance via Wagner-Fischer DP with O(min(n,m)) memory.
 * Operates on grapheme clusters so Hebrew nikkud does not over-penalise.
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
function levenshtein(a, b) {
  const sa = splitChars(a);
  const sb = splitChars(b);
  const n = sa.length;
  const m = sb.length;
  if (n === 0) return m;
  if (m === 0) return n;

  // Ensure b is the shorter of the two to minimise memory.
  let A = sa;
  let B = sb;
  let nA = n;
  let nB = m;
  if (m > n) {
    A = sb;
    B = sa;
    nA = m;
    nB = n;
  }

  let prev = new Array(nB + 1);
  let curr = new Array(nB + 1);
  for (let j = 0; j <= nB; j += 1) prev[j] = j;

  for (let i = 1; i <= nA; i += 1) {
    curr[0] = i;
    const ai = A[i - 1];
    for (let j = 1; j <= nB; j += 1) {
      const cost = ai === B[j - 1] ? 0 : 1;
      const del = prev[j] + 1;
      const ins = curr[j - 1] + 1;
      const sub = prev[j - 1] + cost;
      let best = del;
      if (ins < best) best = ins;
      if (sub < best) best = sub;
      curr[j] = best;
    }
    const tmp = prev;
    prev = curr;
    curr = tmp;
  }
  return prev[nB];
}

/**
 * Freeze a deep-ish diff result. We only freeze the top array and each
 * entry; `value` for line-level diffs is a primitive string, so no deeper
 * freeze needed.
 * @template T
 * @param {T[]} arr
 * @returns {Readonly<T[]>}
 */
function freezeEntries(arr) {
  for (const e of arr) Object.freeze(e);
  return Object.freeze(arr);
}

/* ----------------------------------------------------------------------------
 * 2. DocDiff — public facade. Stateless by contract.
 * -------------------------------------------------------------------------- */

class DocDiff {
  /**
   * Line-level diff using Myers O(ND).
   * @param {string} textA
   * @param {string} textB
   * @returns {Readonly<Array<{op:string,line:string,aIdx?:number,bIdx?:number}>>}
   */
  diffLines(textA, textB) {
    const a = splitLines(textA);
    const b = splitLines(textB);
    const raw = myersDiff(a, b);
    const out = raw.map((op) => {
      const rec = { op: op.op, line: op.value };
      if (op.aIdx !== undefined) rec.aIdx = op.aIdx;
      if (op.bIdx !== undefined) rec.bIdx = op.bIdx;
      return rec;
    });
    return freezeEntries(out);
  }

  /**
   * Word-level diff within a line (or any single string).
   * Returns an array of `{op, token, aIdx?, bIdx?}`.
   * @param {string} textA
   * @param {string} textB
   * @returns {Readonly<Array<{op:string,token:string,aIdx?:number,bIdx?:number}>>}
   */
  diffWords(textA, textB) {
    const a = splitWords(textA);
    const b = splitWords(textB);
    const raw = myersDiff(a, b);
    const out = raw.map((op) => {
      const rec = { op: op.op, token: op.value };
      if (op.aIdx !== undefined) rec.aIdx = op.aIdx;
      if (op.bIdx !== undefined) rec.bIdx = op.bIdx;
      return rec;
    });
    return freezeEntries(out);
  }

  /**
   * Character-level diff, Hebrew-nikkud safe (grapheme clusters).
   * @param {string} textA
   * @param {string} textB
   * @returns {Readonly<Array<{op:string,char:string,aIdx?:number,bIdx?:number}>>}
   */
  diffChars(textA, textB) {
    const a = splitChars(textA);
    const b = splitChars(textB);
    const raw = myersDiff(a, b);
    const out = raw.map((op) => {
      const rec = { op: op.op, char: op.value };
      if (op.aIdx !== undefined) rec.aIdx = op.aIdx;
      if (op.bIdx !== undefined) rec.bIdx = op.bIdx;
      return rec;
    });
    return freezeEntries(out);
  }

  /**
   * Segment both documents by headers, then diff each matching section.
   * Headers are detected by a caller-supplied regex (must have the 'm' flag
   * or be pattern-only; we will add 'm' if missing). Anything before the
   * first header is treated as an implicit "preamble" section with title
   * '' (empty string). Sections with the same title are diffed against
   * each other. Sections only in A or only in B are reported as whole
   * deletions / insertions.
   *
   * @param {string} textA
   * @param {string} textB
   * @param {RegExp}  headerRegex
   * @returns {Readonly<{sections:Array<{title:string, kind:string, diff:any}>,
   *                    titlesA:string[], titlesB:string[]}>}
   */
  diffSections(textA, textB, headerRegex) {
    if (!(headerRegex instanceof RegExp)) {
      throw new TypeError(
        'diffSections: headerRegex must be a RegExp / הארגומנט headerRegex חייב להיות RegExp',
      );
    }
    // Ensure multiline flag so `^` anchors per-line.
    let re = headerRegex;
    if (!re.flags.includes('m')) {
      re = new RegExp(re.source, re.flags + 'm');
    }
    const segmentsA = this._segment(textA, re);
    const segmentsB = this._segment(textB, re);

    const titlesA = segmentsA.map((s) => s.title);
    const titlesB = segmentsB.map((s) => s.title);

    const sections = [];
    // 1. Match B sections to A sections by title, preserving B's order.
    const consumedA = new Set();
    for (const sb of segmentsB) {
      const sa = segmentsA.find(
        (x, i) => !consumedA.has(i) && x.title === sb.title,
      );
      if (sa) {
        consumedA.add(segmentsA.indexOf(sa));
        sections.push({
          title: sb.title,
          kind: 'matched',
          diff: this.diffLines(sa.body, sb.body),
        });
      } else {
        sections.push({
          title: sb.title,
          kind: 'insert',
          diff: this.diffLines('', sb.body),
        });
      }
    }
    // 2. Anything unmatched in A becomes a deletion section.
    segmentsA.forEach((sa, i) => {
      if (consumedA.has(i)) return;
      sections.push({
        title: sa.title,
        kind: 'delete',
        diff: this.diffLines(sa.body, ''),
      });
    });

    return Object.freeze({
      sections: freezeEntries(sections),
      titlesA: Object.freeze(titlesA),
      titlesB: Object.freeze(titlesB),
    });
  }

  /**
   * Segment a document into `[{title, body}]` by a multiline header regex.
   * Content before the first header becomes the preamble (title '').
   * @private
   */
  _segment(text, re) {
    const src = text === null || text === undefined ? '' : String(text);
    const normalized = src.replace(/\r\n?/g, '\n');
    const out = [];
    const indices = [];
    // Collect all header match indices.
    const globalRe = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g');
    let m;
    while ((m = globalRe.exec(normalized)) !== null) {
      indices.push({ index: m.index, length: m[0].length, title: m[0].trim() });
      if (m.index === globalRe.lastIndex) globalRe.lastIndex += 1; // defensive
    }
    if (indices.length === 0) {
      out.push({ title: '', body: normalized });
      return out;
    }
    // Preamble before the first header.
    if (indices[0].index > 0) {
      out.push({ title: '', body: normalized.slice(0, indices[0].index).replace(/\n$/, '') });
    }
    for (let i = 0; i < indices.length; i += 1) {
      const here = indices[i];
      const next = i + 1 < indices.length ? indices[i + 1].index : normalized.length;
      const bodyStart = here.index + here.length;
      // Trim the leading newline after the header if present.
      const body = normalized.slice(bodyStart, next).replace(/^\n/, '').replace(/\n$/, '');
      out.push({ title: here.title, body });
    }
    return out;
  }

  /**
   * Apply a line-diff result to A to reproduce B.
   * Throws if the diff was not produced from this A (structural mismatch).
   * @param {string} textA
   * @param {ReadonlyArray<{op:string,line:string,aIdx?:number,bIdx?:number}>} diffResult
   * @returns {string}
   */
  patch(textA, diffResult) {
    const a = splitLines(textA);
    const out = [];
    let ai = 0;
    for (const d of diffResult) {
      if (d.op === 'equal') {
        if (a[ai] !== d.line) {
          throw new Error(
            `patch: structural mismatch at A[${ai}] / חוסר התאמה מבני ב-A[${ai}]`,
          );
        }
        out.push(a[ai]);
        ai += 1;
      } else if (d.op === 'delete') {
        if (a[ai] !== d.line) {
          throw new Error(
            `patch: structural mismatch at A[${ai}] / חוסר התאמה מבני ב-A[${ai}]`,
          );
        }
        ai += 1;
      } else if (d.op === 'insert') {
        out.push(d.line);
      } else {
        throw new Error(`patch: unknown op '${d.op}' / פעולה לא מוכרת`);
      }
    }
    if (ai !== a.length) {
      throw new Error(
        `patch: diff did not consume all of A (${ai}/${a.length}) / הדיף לא צרך את כל A`,
      );
    }
    return out.join('\n');
  }

  /**
   * Inverse of `patch`: given B and the same diff, reproduce A.
   * @param {string} textB
   * @param {ReadonlyArray<{op:string,line:string,aIdx?:number,bIdx?:number}>} diffResult
   * @returns {string}
   */
  reversePatch(textB, diffResult) {
    const b = splitLines(textB);
    const out = [];
    let bi = 0;
    for (const d of diffResult) {
      if (d.op === 'equal') {
        if (b[bi] !== d.line) {
          throw new Error(
            `reversePatch: structural mismatch at B[${bi}] / חוסר התאמה מבני ב-B[${bi}]`,
          );
        }
        out.push(b[bi]);
        bi += 1;
      } else if (d.op === 'insert') {
        if (b[bi] !== d.line) {
          throw new Error(
            `reversePatch: structural mismatch at B[${bi}] / חוסר התאמה מבני ב-B[${bi}]`,
          );
        }
        bi += 1;
      } else if (d.op === 'delete') {
        out.push(d.line);
      } else {
        throw new Error(`reversePatch: unknown op '${d.op}' / פעולה לא מוכרת`);
      }
    }
    if (bi !== b.length) {
      throw new Error(
        `reversePatch: diff did not consume all of B (${bi}/${b.length}) / הדיף לא צרך את כל B`,
      );
    }
    return out.join('\n');
  }

  /**
   * 3-way merge base↔branchA↔branchB with conflict markers.
   *
   * Algorithm (standard 3-way, line granularity):
   *   1. Diff base→A and base→B.
   *   2. Walk both diffs in lockstep over base-line index.
   *   3. For each base line:
   *        • If neither side changed it → keep as-is.
   *        • If only one side changed → take that change.
   *        • If both sides changed *identically* → take once (clean).
   *        • If both sides changed *differently* → emit a conflict block.
   *   4. Tail insertions from either branch beyond base are merged if they
   *      don't overlap; if both branches append different trailing lines
   *      at the same spot, they become a trailing conflict block.
   *
   * Conflict markers are bilingual Hebrew/English so they are legible in
   * RTL editors:
   *     <<<<<<< סניף א׳ / Branch A
   *     ...lines from A...
   *     ||||||| בסיס משותף / Base
   *     ...base lines...
   *     =======
   *     ...lines from B...
   *     >>>>>>> סניף ב׳ / Branch B
   *
   * @param {string} base
   * @param {string} branchA
   * @param {string} branchB
   * @returns {Readonly<{merged:string, clean:boolean, conflicts:number,
   *                    hunks:Array<{kind:string, lines?:string[],
   *                                 a?:string[], b?:string[], base?:string[]}>}>}
   */
  mergeThreeWay(base, branchA, branchB) {
    const baseLines = splitLines(base);
    const aLines = splitLines(branchA);
    const bLines = splitLines(branchB);

    // Per-base-index classification: for every base line, what happened on
    // each side? We build two aligned edit lists then zip them.
    const diffA = myersDiff(baseLines, aLines);
    const diffB = myersDiff(baseLines, bLines);

    // Expand each diff into a base-aligned stream of "slots". Each slot is
    // either {kind:'keep', base:i, side:line} — base line i retained on side
    // or {kind:'replace', base:i, side:[...]} — base line i replaced by []
    // or {kind:'delete', base:i} — base line removed on side
    // Plus a trailing bucket of inserts that happen AFTER base end.
    const streamA = this._classify(diffA, baseLines.length);
    const streamB = this._classify(diffB, baseLines.length);

    const mergedLines = [];
    const hunks = [];
    let conflicts = 0;

    // Helpers to pull pending inserts at a given base slot.
    const takeInserts = (stream, baseIdx) => {
      const out = [];
      while (
        stream.inserts.length &&
        stream.inserts[0].at === baseIdx
      ) {
        out.push(...stream.inserts.shift().lines);
      }
      return out;
    };

    for (let i = 0; i <= baseLines.length; i += 1) {
      const insertsA = takeInserts(streamA, i);
      const insertsB = takeInserts(streamB, i);
      if (insertsA.length || insertsB.length) {
        const same =
          insertsA.length === insertsB.length &&
          insertsA.every((v, k) => v === insertsB[k]);
        if (same) {
          mergedLines.push(...insertsA);
          if (insertsA.length) {
            hunks.push({ kind: 'insert', lines: insertsA.slice() });
          }
        } else if (insertsA.length && !insertsB.length) {
          mergedLines.push(...insertsA);
          hunks.push({ kind: 'insert-a', lines: insertsA.slice() });
        } else if (insertsB.length && !insertsA.length) {
          mergedLines.push(...insertsB);
          hunks.push({ kind: 'insert-b', lines: insertsB.slice() });
        } else {
          // Both inserted different content at the same slot → conflict.
          conflicts += 1;
          mergedLines.push(
            LABELS.conflictStart.en,
            ...insertsA,
            LABELS.conflictBase.en,
            LABELS.conflictMid.en,
            ...insertsB,
            LABELS.conflictEnd.en,
          );
          hunks.push({
            kind: 'conflict',
            a: insertsA.slice(),
            b: insertsB.slice(),
            base: [],
          });
        }
      }

      if (i === baseLines.length) break;

      // Base line i: classify on each side.
      const slotA = streamA.slots[i]; // 'keep' | 'delete' | 'replace'
      const slotB = streamB.slots[i];
      const baseLine = baseLines[i];

      if (slotA.kind === 'keep' && slotB.kind === 'keep') {
        mergedLines.push(baseLine);
      } else if (slotA.kind === 'delete' && slotB.kind === 'delete') {
        // Both sides deleted — drop it cleanly.
      } else if (slotA.kind === 'keep' && slotB.kind === 'delete') {
        // Only B deleted — take the delete.
      } else if (slotA.kind === 'delete' && slotB.kind === 'keep') {
        // Only A deleted — take the delete.
      } else if (slotA.kind === 'keep' && slotB.kind === 'replace') {
        mergedLines.push(...slotB.lines);
      } else if (slotA.kind === 'replace' && slotB.kind === 'keep') {
        mergedLines.push(...slotA.lines);
      } else if (slotA.kind === 'replace' && slotB.kind === 'replace') {
        const same =
          slotA.lines.length === slotB.lines.length &&
          slotA.lines.every((v, k) => v === slotB.lines[k]);
        if (same) {
          mergedLines.push(...slotA.lines);
        } else {
          conflicts += 1;
          mergedLines.push(
            LABELS.conflictStart.en,
            ...slotA.lines,
            LABELS.conflictBase.en,
            baseLine,
            LABELS.conflictMid.en,
            ...slotB.lines,
            LABELS.conflictEnd.en,
          );
          hunks.push({
            kind: 'conflict',
            a: slotA.lines.slice(),
            b: slotB.lines.slice(),
            base: [baseLine],
          });
        }
      } else if (slotA.kind === 'delete' && slotB.kind === 'replace') {
        // Delete vs modify — classic conflict.
        conflicts += 1;
        mergedLines.push(
          LABELS.conflictStart.en,
          LABELS.conflictBase.en,
          baseLine,
          LABELS.conflictMid.en,
          ...slotB.lines,
          LABELS.conflictEnd.en,
        );
        hunks.push({
          kind: 'conflict',
          a: [],
          b: slotB.lines.slice(),
          base: [baseLine],
        });
      } else if (slotA.kind === 'replace' && slotB.kind === 'delete') {
        conflicts += 1;
        mergedLines.push(
          LABELS.conflictStart.en,
          ...slotA.lines,
          LABELS.conflictBase.en,
          baseLine,
          LABELS.conflictMid.en,
          LABELS.conflictEnd.en,
        );
        hunks.push({
          kind: 'conflict',
          a: slotA.lines.slice(),
          b: [],
          base: [baseLine],
        });
      }
    }

    return Object.freeze({
      merged: mergedLines.join('\n'),
      clean: conflicts === 0,
      conflicts,
      hunks: Object.freeze(hunks.map((h) => Object.freeze(h))),
    });
  }

  /**
   * Classify a base→side diff into per-base-line slots plus a list of
   * insertion buckets keyed by the base index they immediately follow.
   * @private
   */
  _classify(diff, baseLen) {
    const slots = new Array(baseLen);
    for (let k = 0; k < baseLen; k += 1) slots[k] = null;
    const inserts = []; // {at:baseIdx, lines:[]}
    let baseIdx = 0;
    let i = 0;
    while (i < diff.length) {
      const d = diff[i];
      if (d.op === 'equal') {
        slots[baseIdx] = { kind: 'keep' };
        baseIdx += 1;
        i += 1;
      } else if (d.op === 'delete') {
        // A run of deletes possibly followed by a run of inserts is a replace.
        const deleteRun = [];
        while (i < diff.length && diff[i].op === 'delete') {
          deleteRun.push(diff[i].value);
          i += 1;
        }
        const insertRun = [];
        while (i < diff.length && diff[i].op === 'insert') {
          insertRun.push(diff[i].value);
          i += 1;
        }
        if (insertRun.length > 0) {
          // Replace: attach all inserts to the first deleted base line.
          slots[baseIdx] = { kind: 'replace', lines: insertRun };
          baseIdx += 1;
          for (let k = 1; k < deleteRun.length; k += 1) {
            slots[baseIdx] = { kind: 'delete' };
            baseIdx += 1;
          }
        } else {
          for (let k = 0; k < deleteRun.length; k += 1) {
            slots[baseIdx] = { kind: 'delete' };
            baseIdx += 1;
          }
        }
      } else if (d.op === 'insert') {
        // Standalone insert before baseIdx.
        const insertRun = [];
        while (i < diff.length && diff[i].op === 'insert') {
          insertRun.push(diff[i].value);
          i += 1;
        }
        inserts.push({ at: baseIdx, lines: insertRun });
      }
    }
    // Fill any remaining null slots (shouldn't happen, defensive).
    for (let k = 0; k < baseLen; k += 1) {
      if (slots[k] === null) slots[k] = { kind: 'keep' };
    }
    return { slots, inserts };
  }

  /**
   * Render a line-diff as bilingual RTL HTML.
   * Every user-originated string is HTML-escaped before rendering.
   * @param {ReadonlyArray<{op:string,line:string}>} diff
   * @returns {string}
   */
  formatHTML(diff) {
    const rows = [];
    rows.push(
      '<div dir="rtl" lang="he" class="onyx-doc-diff" ' +
      'style="font-family:Arial,Helvetica,sans-serif;direction:rtl;text-align:right;">',
    );
    rows.push(
      `  <h3>${escapeHtml(LABELS.diffReportTitle.he)} / ${escapeHtml(LABELS.diffReportTitle.en)}</h3>`,
    );
    rows.push('  <pre style="white-space:pre-wrap;">');
    for (const d of diff) {
      const line = escapeHtml(d.line);
      if (d.op === 'equal') {
        rows.push(`    <span>${line}</span>`);
      } else if (d.op === 'insert') {
        rows.push(
          `    <ins title="${escapeHtml(DIFF_OPS.insert.he)} / ${escapeHtml(DIFF_OPS.insert.en)}" ` +
          `style="background:#d4f4dd;text-decoration:none;">${line}</ins>`,
        );
      } else if (d.op === 'delete') {
        rows.push(
          `    <del title="${escapeHtml(DIFF_OPS.delete.he)} / ${escapeHtml(DIFF_OPS.delete.en)}" ` +
          `style="background:#f7d4d4;text-decoration:line-through;">${line}</del>`,
        );
      }
    }
    rows.push('  </pre>');
    rows.push('</div>');
    return rows.join('\n');
  }

  /**
   * Render a line-diff as Markdown with +++/--- prefixes.
   * @param {ReadonlyArray<{op:string,line:string}>} diff
   * @returns {string}
   */
  formatMarkdown(diff) {
    const out = [];
    out.push(
      `<!-- ${LABELS.diffReportTitle.he} / ${LABELS.diffReportTitle.en} -->`,
    );
    out.push('```diff');
    for (const d of diff) {
      if (d.op === 'equal') {
        out.push(`  ${d.line}`);
      } else if (d.op === 'insert') {
        out.push(`+++ ${d.line}`);
      } else if (d.op === 'delete') {
        out.push(`--- ${d.line}`);
      }
    }
    out.push('```');
    return out.join('\n');
  }

  /**
   * Classic unified diff output with @@ hunk headers and N context lines.
   * @param {ReadonlyArray<{op:string,line:string,aIdx?:number,bIdx?:number}>} diff
   * @param {number} [contextLines=3]
   * @returns {string}
   */
  formatUnified(diff, contextLines = 3) {
    const ctx = Math.max(0, Number(contextLines) | 0);
    // Walk the diff and emit hunks: any maximal run containing a non-equal
    // op, padded with up to `ctx` equal lines on each side, becomes a hunk.
    // Multiple hunks may be produced if big equal runs separate them.
    const entries = Array.isArray(diff) ? diff : Array.from(diff);
    const n = entries.length;
    if (n === 0) return '';

    // Identify positions of changes.
    const changeIdx = [];
    for (let i = 0; i < n; i += 1) {
      if (entries[i].op !== 'equal') changeIdx.push(i);
    }
    if (changeIdx.length === 0) return '';

    // Group close-together changes into hunks. Two changes belong to the
    // same hunk if they are separated by <= 2*ctx equal lines.
    const groups = [];
    let start = changeIdx[0];
    let last = changeIdx[0];
    for (let k = 1; k < changeIdx.length; k += 1) {
      const idx = changeIdx[k];
      if (idx - last > 2 * ctx) {
        groups.push([start, last]);
        start = idx;
      }
      last = idx;
    }
    groups.push([start, last]);

    const lines = [];
    for (const [gs, ge] of groups) {
      const from = Math.max(0, gs - ctx);
      const to = Math.min(n - 1, ge + ctx);

      // Compute line numbers for the @@ header.
      // Find the first line numbers in this slice.
      let aStart = 0;
      let bStart = 0;
      let aCount = 0;
      let bCount = 0;
      // Walk once to count.
      let firstASet = false;
      let firstBSet = false;
      for (let i = from; i <= to; i += 1) {
        const e = entries[i];
        if (e.op === 'equal') {
          if (!firstASet && e.aIdx !== undefined) { aStart = e.aIdx; firstASet = true; }
          if (!firstBSet && e.bIdx !== undefined) { bStart = e.bIdx; firstBSet = true; }
          aCount += 1;
          bCount += 1;
        } else if (e.op === 'delete') {
          if (!firstASet && e.aIdx !== undefined) { aStart = e.aIdx; firstASet = true; }
          aCount += 1;
        } else if (e.op === 'insert') {
          if (!firstBSet && e.bIdx !== undefined) { bStart = e.bIdx; firstBSet = true; }
          bCount += 1;
        }
      }
      // Unified diff uses 1-based line numbers, and 0 when the range is empty.
      const aDisp = aCount === 0 ? 0 : aStart + 1;
      const bDisp = bCount === 0 ? 0 : bStart + 1;
      lines.push(`@@ -${aDisp},${aCount} +${bDisp},${bCount} @@`);
      for (let i = from; i <= to; i += 1) {
        const e = entries[i];
        const sign = DIFF_OPS[e.op].sign;
        lines.push(`${sign}${e.line}`);
      }
    }
    return lines.join('\n');
  }

  /**
   * Count operations and compute the percent-changed metric.
   * @param {ReadonlyArray<{op:string}>} diff
   * @returns {Readonly<{insertions:number, deletions:number, unchanged:number,
   *                    total:number, percentChanged:number,
   *                    labels:object}>}
   */
  summary(diff) {
    let ins = 0;
    let del = 0;
    let eq = 0;
    for (const d of diff) {
      if (d.op === 'insert') ins += 1;
      else if (d.op === 'delete') del += 1;
      else if (d.op === 'equal') eq += 1;
    }
    const total = ins + del + eq;
    const changed = ins + del;
    const pct = total === 0 ? 0 : Math.round((changed / total) * 10000) / 100;
    return Object.freeze({
      insertions: ins,
      deletions: del,
      unchanged: eq,
      total,
      percentChanged: pct,
      labels: Object.freeze({
        insertions: { he: LABELS.inserted.he, en: LABELS.inserted.en },
        deletions:  { he: LABELS.deleted.he,  en: LABELS.deleted.en },
        unchanged:  { he: LABELS.unchanged.he, en: LABELS.unchanged.en },
        percentChanged: { he: LABELS.pctChanged.he, en: LABELS.pctChanged.en },
      }),
    });
  }

  /**
   * Similarity in [0,1] based on Levenshtein over grapheme clusters.
   * 1.0 means identical; 0.0 means completely disjoint (up to the length
   * cap). Two empty strings are defined as 1.0 (identical).
   * @param {string} textA
   * @param {string} textB
   * @returns {number}
   */
  similarityScore(textA, textB) {
    const a = textA === null || textA === undefined ? '' : String(textA);
    const b = textB === null || textB === undefined ? '' : String(textB);
    if (a === '' && b === '') return 1;
    const la = splitChars(a).length;
    const lb = splitChars(b).length;
    const maxLen = la > lb ? la : lb;
    if (maxLen === 0) return 1;
    const dist = levenshtein(a, b);
    const score = 1 - dist / maxLen;
    if (score < 0) return 0;
    if (score > 1) return 1;
    // Round to 4 decimals so the value is stable across platforms.
    return Math.round(score * 10000) / 10000;
  }
}

/* Allow the class methods to be called as static functions as well, so
 * callers that prefer `DocDiff.diffLines(a, b)` (no instance) also work.
 * We do NOT cache an instance — every static call is a direct delegate. */
const METHOD_NAMES = [
  'diffLines', 'diffWords', 'diffChars', 'diffSections',
  'patch', 'reversePatch', 'mergeThreeWay',
  'formatHTML', 'formatMarkdown', 'formatUnified',
  'summary', 'similarityScore',
];
for (const name of METHOD_NAMES) {
  if (typeof DocDiff.prototype[name] === 'function') {
    DocDiff[name] = function staticForward(...args) {
      return new DocDiff()[name](...args);
    };
  }
}

/* ----------------------------------------------------------------------------
 * 3. Exports
 * -------------------------------------------------------------------------- */

module.exports = {
  DocDiff,
  DIFF_OPS,
  MERGE_KINDS,
  LABELS,
  // Exposed helpers (used by tests; treat as module-private otherwise).
  _internals: Object.freeze({
    escapeHtml,
    splitLines,
    splitWords,
    splitChars,
    hasHebrew,
    myersDiff,
    levenshtein,
  }),
};
