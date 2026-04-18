/**
 * doc-diff.js — Document Comparison / Redline / Diff Engine
 * Agent AG-Y117 — Techno-Kol Uzi Mega-ERP (Kobi EL) — Swarm 4/2026
 *
 * Rule of engagement: לא מוחקים רק משדרגים ומגדלים
 * (never delete, only upgrade and grow).
 *
 * Zero external dependencies. Pure Node / pure JS. Browser-bundleable.
 * Bilingual (he/en) everywhere a user-facing label shows up.
 *
 * Exports a single class `DocDiff` with:
 *
 *   diffText(a, b, {granularity})          - structured/unified diff
 *   myersDiff(a, b)                        - Myers O(ND) diff (tokens)
 *   highlightChanges({textA, textB, fmt})  - side-by-side / inline
 *   semanticDiff({docA, docB})             - whitespace/punctuation aware
 *   contractDiff({contractA, contractB, clauseLibrary})
 *   approvalTrackChanges(diff)             - accept/reject tracker
 *   generateRedlinePDF(diff)               - minimal, zero-dep PDF
 *   summarize(diff)                        - bilingual summary
 *   structuralDiff({jsonA, jsonB})         - JSON/object structural diff
 *   versionChain(docId)                    - diff across versions
 *   mergeConflict({base, a, b})            - three-way merge
 *   hebrewAwareDiff(textA, textB)          - niqqud/RTL aware
 *
 * Runs on Node >= 16.
 */

'use strict';

// ─────────────────────────────────────────────────────────────────────
// Hebrew / RTL unicode helpers
// ─────────────────────────────────────────────────────────────────────

/** Hebrew niqqud (vowel points & cantillation) block U+0591..U+05C7. */
const NIQQUD_REGEX = /[\u0591-\u05C7]/g;

/** RTL/LTR marks and embedding controls — visually invisible. */
const BIDI_CONTROLS_REGEX = /[\u200E\u200F\u202A-\u202E\u2066-\u2069]/g;

/** Any Hebrew letter (base, including final forms). */
const HEBREW_LETTER_REGEX = /[\u05D0-\u05EA\uFB1D-\uFB4F]/;

/** Common Hebrew punctuation/maqaf/geresh etc. */
const HEBREW_PUNCT_REGEX = /[\u05BE\u05F3\u05F4]/g;

/**
 * Strip niqqud + bidi marks so "שָׁלוֹם" == "שלום" for comparison purposes.
 * The original strings are never mutated — comparisons run on the stripped
 * copies, while the output still carries the originals.
 */
function stripNiqqud(s) {
  if (typeof s !== 'string') return s;
  return s.replace(NIQQUD_REGEX, '').replace(BIDI_CONTROLS_REGEX, '');
}

/** Is this string predominantly Hebrew? (presence of any Hebrew letter). */
function containsHebrew(s) {
  return typeof s === 'string' && HEBREW_LETTER_REGEX.test(s);
}

// ─────────────────────────────────────────────────────────────────────
// Tokenizers (one per granularity)
// ─────────────────────────────────────────────────────────────────────

/** Character-granularity: JS strings already iterate by code unit. */
function tokenizeChar(s) {
  if (!s) return [];
  return Array.from(String(s));
}

/** Line-granularity: splits on \n, preserves empty lines. */
function tokenizeLine(s) {
  if (s == null) return [];
  return String(s).split(/\r?\n/);
}

/**
 * Word-granularity. Unicode-aware split that keeps Hebrew + Latin
 * + digits together but separates whitespace/punctuation into their
 * own tokens so "שלום," diffs as ["שלום", ","] not as one blob.
 */
function tokenizeWord(s) {
  if (!s) return [];
  const out = [];
  const src = String(s);
  // Word = run of [letter|digit|Hebrew|diacritic]; everything else is
  // a singleton token (space, comma, dot, punctuation…).
  const re = /[\p{L}\p{M}\p{N}]+|\s+|[^\p{L}\p{M}\p{N}\s]/gu;
  let m;
  while ((m = re.exec(src)) !== null) out.push(m[0]);
  return out;
}

/** Sentence-granularity — ASCII . ! ? plus Hebrew sof-pasuk ׃ and ellipsis. */
function tokenizeSentence(s) {
  if (!s) return [];
  const src = String(s);
  // Split *after* terminal punctuation followed by whitespace/end,
  // preserving terminator with the sentence it closes.
  const out = [];
  let buf = '';
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    buf += ch;
    if (ch === '.' || ch === '!' || ch === '?' || ch === '\u05C3' /* ׃ */) {
      const next = src[i + 1];
      if (!next || /\s/.test(next)) {
        // swallow trailing whitespace
        while (i + 1 < src.length && /\s/.test(src[i + 1])) {
          buf += src[++i];
        }
        out.push(buf);
        buf = '';
      }
    }
  }
  if (buf.length) out.push(buf);
  return out;
}

/** Pick a tokenizer by granularity name. Default = 'word'. */
function tokenizerFor(granularity) {
  switch (granularity) {
    case 'char':     return tokenizeChar;
    case 'line':     return tokenizeLine;
    case 'sentence': return tokenizeSentence;
    case 'word':
    case undefined:
    case null:       return tokenizeWord;
    default:
      throw new Error(
        `Unknown granularity: ${granularity} | גרנולריות לא ידועה`
      );
  }
}

// ─────────────────────────────────────────────────────────────────────
// Myers O(ND) diff — pure, zero-dep
// ─────────────────────────────────────────────────────────────────────
//
// Classic Myers (1986) forward D-path search. Returns the shortest
// edit script between token arrays `a` and `b`.
//
// The algorithm:
//   - Search for the first D such that we can reach (N, M) with D edits.
//   - Record each frontier V[] at the end of round D.
//   - Backtrack through the recorded frontiers to emit the script.
//
// Space/time: O((N+M) * D) worst case; O((N+M)) best case (identical).
// ─────────────────────────────────────────────────────────────────────

/**
 * Myers diff. Returns an ordered list of operations:
 *   { op: 'equal'|'insert'|'delete', token: <string> }
 *
 * Works on arrays of strings (tokens) OR plain strings (auto chars).
 */
function myersDiff(a, b) {
  if (typeof a === 'string' && typeof b === 'string') {
    a = tokenizeChar(a);
    b = tokenizeChar(b);
  }
  if (!Array.isArray(a)) a = Array.from(a || []);
  if (!Array.isArray(b)) b = Array.from(b || []);

  const N = a.length;
  const M = b.length;
  const MAX = N + M;

  // Fast paths
  if (N === 0 && M === 0) return [];
  if (N === 0) return b.map(t => ({ op: 'insert', token: t }));
  if (M === 0) return a.map(t => ({ op: 'delete', token: t }));

  // V[k] = furthest x reached on diagonal k after D edits.
  // Use an offset so negative k becomes positive index.
  const offset = MAX;
  const V = new Int32Array(2 * MAX + 1);
  // Record a snapshot of V for every D so we can backtrack.
  const trace = [];

  let reachedD = -1;
  outer: for (let D = 0; D <= MAX; D++) {
    // Save snapshot of the current V before modifying.
    // Only need entries in [-D, D] but we just clone the active slice.
    const snapshot = new Int32Array(V.length);
    snapshot.set(V);
    trace.push(snapshot);

    for (let k = -D; k <= D; k += 2) {
      let x;
      // Choose insertion (down) vs deletion (right).
      if (k === -D || (k !== D && V[offset + k - 1] < V[offset + k + 1])) {
        x = V[offset + k + 1];            // insert — take from b
      } else {
        x = V[offset + k - 1] + 1;        // delete — take from a
      }
      let y = x - k;

      // Follow snake (matching tokens) as far as possible.
      while (x < N && y < M && a[x] === b[y]) {
        x++;
        y++;
      }

      V[offset + k] = x;

      if (x >= N && y >= M) {
        reachedD = D;
        break outer;
      }
    }
  }

  if (reachedD === -1) {
    // Should not happen — MAX is an upper bound.
    throw new Error('Myers diff failed to converge | Myers diff לא התכנס');
  }

  // ───── Backtrack ─────
  const ops = [];
  let x = N;
  let y = M;
  for (let D = reachedD; D > 0; D--) {
    const Vprev = trace[D];
    const k = x - y;
    let prevK;
    if (k === -D || (k !== D && Vprev[offset + k - 1] < Vprev[offset + k + 1])) {
      prevK = k + 1;  // insert came from above
    } else {
      prevK = k - 1;  // delete came from left
    }
    const prevX = Vprev[offset + prevK];
    const prevY = prevX - prevK;

    // Emit the matching snake from (prevX+?,prevY+?) back to (x,y).
    while (x > prevX && y > prevY) {
      ops.push({ op: 'equal', token: a[x - 1] });
      x--; y--;
    }
    if (D > 0) {
      if (x === prevX) {
        ops.push({ op: 'insert', token: b[y - 1] });
        y--;
      } else {
        ops.push({ op: 'delete', token: a[x - 1] });
        x--;
      }
    }
  }
  // Trailing equal snake for D=0.
  while (x > 0 && y > 0) {
    ops.push({ op: 'equal', token: a[x - 1] });
    x--; y--;
  }
  while (x > 0) {
    ops.push({ op: 'delete', token: a[x - 1] });
    x--;
  }
  while (y > 0) {
    ops.push({ op: 'insert', token: b[y - 1] });
    y--;
  }

  ops.reverse();
  return ops;
}

// ─────────────────────────────────────────────────────────────────────
// Unified-diff style renderer (for textual inspection)
// ─────────────────────────────────────────────────────────────────────

function renderUnified(ops, {contextLines = 3, joinWith = ''} = {}) {
  // For line granularity the natural join is '\n'.
  const lines = [];
  for (const op of ops) {
    const prefix = op.op === 'equal'  ? ' '
                 : op.op === 'insert' ? '+'
                 : op.op === 'delete' ? '-' : '?';
    lines.push(prefix + op.token);
  }
  return lines.join(joinWith === '' ? '\n' : joinWith);
}

// ─────────────────────────────────────────────────────────────────────
// Change summarization helpers
// ─────────────────────────────────────────────────────────────────────

function countChanges(ops) {
  let inserts = 0, deletes = 0, equals = 0;
  for (const op of ops) {
    if (op.op === 'insert') inserts++;
    else if (op.op === 'delete') deletes++;
    else equals++;
  }
  return { inserts, deletes, equals, total: ops.length };
}

/**
 * Collapse consecutive insert/delete ops into change "hunks" so
 * a ["delete","insert"] pair reads as a replacement, etc.
 */
function toHunks(ops) {
  const hunks = [];
  let cursor = null;
  for (const op of ops) {
    if (op.op === 'equal') {
      if (cursor) { hunks.push(cursor); cursor = null; }
      continue;
    }
    if (!cursor) cursor = { deletes: [], inserts: [] };
    if (op.op === 'delete') cursor.deletes.push(op.token);
    else                    cursor.inserts.push(op.token);
  }
  if (cursor) hunks.push(cursor);
  return hunks;
}

// ─────────────────────────────────────────────────────────────────────
// HTML / Markdown redline rendering
// ─────────────────────────────────────────────────────────────────────

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderInlineHTML(ops, {dir = 'ltr'} = {}) {
  const parts = [`<div class="docdiff-inline" dir="${dir}">`];
  for (const op of ops) {
    const tok = escapeHtml(op.token);
    if (op.op === 'equal')       parts.push(`<span class="eq">${tok}</span>`);
    else if (op.op === 'insert') parts.push(`<ins class="add">${tok}</ins>`);
    else if (op.op === 'delete') parts.push(`<del class="rem">${tok}</del>`);
  }
  parts.push('</div>');
  return parts.join('');
}

function renderSideBySideHTML(ops, {dir = 'ltr'} = {}) {
  const left = [];
  const right = [];
  for (const op of ops) {
    const tok = escapeHtml(op.token);
    if (op.op === 'equal') {
      left.push(`<span class="eq">${tok}</span>`);
      right.push(`<span class="eq">${tok}</span>`);
    } else if (op.op === 'insert') {
      right.push(`<ins class="add">${tok}</ins>`);
    } else if (op.op === 'delete') {
      left.push(`<del class="rem">${tok}</del>`);
    }
  }
  return (
    `<table class="docdiff-sbs" dir="${dir}">` +
    `<tr><th>Before / לפני</th><th>After / אחרי</th></tr>` +
    `<tr><td>${left.join('')}</td><td>${right.join('')}</td></tr>` +
    `</table>`
  );
}

function renderMarkdown(ops) {
  const parts = [];
  for (const op of ops) {
    if (op.op === 'equal')       parts.push(op.token);
    else if (op.op === 'insert') parts.push(`{+${op.token}+}`);
    else if (op.op === 'delete') parts.push(`{-${op.token}-}`);
  }
  return parts.join('');
}

function renderDocx(ops) {
  // Emit a Word-compatible flat OOXML fragment. Not a full .docx package,
  // but importable via Word "Paste Special → Formatted text".
  const parts = [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">',
    '<w:body><w:p>'
  ];
  for (const op of ops) {
    const tok = escapeHtml(op.token);
    if (op.op === 'equal') {
      parts.push(`<w:r><w:t xml:space="preserve">${tok}</w:t></w:r>`);
    } else if (op.op === 'insert') {
      parts.push(
        `<w:ins w:id="${parts.length}" w:author="DocDiff" w:date="">` +
        `<w:r><w:t xml:space="preserve">${tok}</w:t></w:r></w:ins>`
      );
    } else if (op.op === 'delete') {
      parts.push(
        `<w:del w:id="${parts.length}" w:author="DocDiff" w:date="">` +
        `<w:r><w:delText xml:space="preserve">${tok}</w:delText></w:r></w:del>`
      );
    }
  }
  parts.push('</w:p></w:body></w:document>');
  return parts.join('');
}

// ─────────────────────────────────────────────────────────────────────
// Minimal zero-dep PDF writer
// ─────────────────────────────────────────────────────────────────────
//
// Writes a valid PDF/1.4 single-page document with a Helvetica courier-
// ish text stream. Supports plain ASCII in the base fonts only; Hebrew
// text is preserved in the source stream but readers that don't embed
// a Hebrew font will fall back to box glyphs. For production rendering
// swap to the system PDF service — this exists so callers can fetch a
// "something" without a dep.
// ─────────────────────────────────────────────────────────────────────

function escapePdfText(s) {
  return String(s)
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

function buildMinimalPDF(title, bodyLines) {
  const objects = [];
  const add = (body) => { objects.push(body); return objects.length; };

  // Font object (Helvetica — one of the 14 PDF standard fonts, always available)
  const fontId = add(
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'
  );

  // Content stream: draw the title then each line at decreasing Y
  const streamParts = ['BT', '/F1 14 Tf', '72 760 Td',
    `(${escapePdfText(title)}) Tj`, '0 -24 Td', '/F1 10 Tf'];
  for (const line of bodyLines) {
    streamParts.push(`(${escapePdfText(line)}) Tj`, '0 -14 Td');
  }
  streamParts.push('ET');
  const stream = streamParts.join('\n');
  const contentId = add(
    `<< /Length ${Buffer.byteLength(stream, 'latin1')} >>\nstream\n${stream}\nendstream`
  );

  const pageId = add(
    `<< /Type /Page /Parent 4 0 R /MediaBox [0 0 612 792] ` +
    `/Contents ${contentId} 0 R ` +
    `/Resources << /Font << /F1 ${fontId} 0 R >> >> >>`
  );
  const pagesId = add(
    `<< /Type /Pages /Count 1 /Kids [${pageId} 0 R] >>`
  );
  const catalogId = add(
    `<< /Type /Catalog /Pages ${pagesId} 0 R >>`
  );

  // Assemble body & xref
  const header = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n';
  const parts = [header];
  const xrefOffsets = [0];
  let offset = Buffer.byteLength(header, 'latin1');
  for (let i = 0; i < objects.length; i++) {
    const body = `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
    xrefOffsets.push(offset);
    parts.push(body);
    offset += Buffer.byteLength(body, 'latin1');
  }
  const xrefStart = offset;
  let xref = `xref\n0 ${objects.length + 1}\n`;
  xref += '0000000000 65535 f \n';
  for (let i = 1; i <= objects.length; i++) {
    xref += `${String(xrefOffsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  xref += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\n`;
  xref += `startxref\n${xrefStart}\n%%EOF\n`;
  parts.push(xref);
  return Buffer.from(parts.join(''), 'latin1');
}

// ─────────────────────────────────────────────────────────────────────
// Structural / JSON diff
// ─────────────────────────────────────────────────────────────────────

function isObject(x) {
  return x !== null && typeof x === 'object' && !Array.isArray(x);
}

function structuralDiffImpl(a, b, path = '') {
  const changes = [];

  if (a === b) return changes;

  // Primitive change (or mismatched type)
  if (!isObject(a) && !isObject(b) && !Array.isArray(a) && !Array.isArray(b)) {
    if (a !== b) {
      changes.push({ op: 'replace', path, from: a, to: b });
    }
    return changes;
  }

  if (Array.isArray(a) && Array.isArray(b)) {
    const max = Math.max(a.length, b.length);
    for (let i = 0; i < max; i++) {
      const childPath = `${path}[${i}]`;
      if (i >= a.length) {
        changes.push({ op: 'add', path: childPath, value: b[i] });
      } else if (i >= b.length) {
        changes.push({ op: 'remove', path: childPath, value: a[i] });
      } else {
        changes.push(...structuralDiffImpl(a[i], b[i], childPath));
      }
    }
    return changes;
  }

  if (isObject(a) && isObject(b)) {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const k of keys) {
      const childPath = path ? `${path}.${k}` : k;
      if (!(k in a)) {
        changes.push({ op: 'add', path: childPath, value: b[k] });
      } else if (!(k in b)) {
        changes.push({ op: 'remove', path: childPath, value: a[k] });
      } else {
        changes.push(...structuralDiffImpl(a[k], b[k], childPath));
      }
    }
    return changes;
  }

  // Type mismatch (e.g. object vs array / primitive vs object)
  changes.push({ op: 'replace', path, from: a, to: b });
  return changes;
}

// ─────────────────────────────────────────────────────────────────────
// Contract-clause heuristic helpers
// ─────────────────────────────────────────────────────────────────────

const DEFAULT_RISK_WEIGHTS = {
  // English keys
  indemnification:    10,
  limitation:          9,
  termination:         8,
  warranty:            7,
  liability:           9,
  payment:             6,
  confidentiality:     5,
  governing_law:       4,
  jurisdiction:        4,
  force_majeure:       3,
  intellectual:        7,
  data_protection:     8,
  // Hebrew keys
  'שיפוי':             10,
  'הגבלת אחריות':       9,
  'סיום':               8,
  'אחריות':             9,
  'תשלום':              6,
  'סודיות':             5,
  'דין חל':             4,
  'סמכות שיפוט':         4,
  'כוח עליון':          3,
  'קניין רוחני':        7,
  'הגנת מידע':          8,
};

function clauseRiskWeight(key, library = {}) {
  const lower = String(key).toLowerCase();
  return (
    (library && library[key]) ??
    (library && library[lower]) ??
    DEFAULT_RISK_WEIGHTS[key] ??
    DEFAULT_RISK_WEIGHTS[lower] ??
    1
  );
}

// ─────────────────────────────────────────────────────────────────────
// Three-way merge
// ─────────────────────────────────────────────────────────────────────
//
// Splits each side into tokens, computes base→a and base→b diffs, then
// walks the token arrays in lock-step to emit either a merged value or
// a conflict region when both sides touch the same base chunk.
// ─────────────────────────────────────────────────────────────────────

function threeWayMergeTokens(baseTokens, aTokens, bTokens) {
  // Compute LCS-based mappings of base->a and base->b by walking myers ops.
  const opsA = myersDiff(baseTokens, aTokens);
  const opsB = myersDiff(baseTokens, bTokens);

  // Walk the base index 0..N and for each base token decide:
  //   - both kept unchanged      -> emit original
  //   - one side changed, other same -> accept changed side
  //   - both changed differently -> conflict
  const chunksA = chunkifyByBase(baseTokens, opsA);
  const chunksB = chunkifyByBase(baseTokens, opsB);

  const merged = [];
  const conflicts = [];
  // chunksA / chunksB are parallel per-base-index arrays:
  //   { kind: 'keep'|'replace'|'delete', replacement: [...tokens] }
  // plus a trailing "tail" for inserts that come *after* the last base token.
  for (let i = 0; i <= baseTokens.length; i++) {
    const ca = chunksA[i];
    const cb = chunksB[i];
    // Leading inserts (before processing base token i) for each side.
    const leadingA = ca.leading || [];
    const leadingB = cb.leading || [];
    if (sameTokens(leadingA, leadingB)) {
      merged.push(...leadingA);
    } else if (leadingA.length === 0) {
      merged.push(...leadingB);
    } else if (leadingB.length === 0) {
      merged.push(...leadingA);
    } else {
      conflicts.push({
        base: [],
        a: leadingA,
        b: leadingB,
        at: i,
      });
      merged.push({ conflict: true, a: leadingA, b: leadingB, base: [] });
    }

    if (i === baseTokens.length) break; // no base token to process

    const tok = baseTokens[i];
    const aKind = ca.kind;
    const bKind = cb.kind;
    if (aKind === 'keep' && bKind === 'keep') {
      merged.push(tok);
    } else if (aKind === 'keep') {
      if (bKind === 'replace') merged.push(...cb.replacement);
      // 'delete' -> emit nothing
    } else if (bKind === 'keep') {
      if (aKind === 'replace') merged.push(...ca.replacement);
    } else {
      // both sides touched it
      const aRepl = aKind === 'replace' ? ca.replacement : [];
      const bRepl = bKind === 'replace' ? cb.replacement : [];
      if (sameTokens(aRepl, bRepl)) {
        merged.push(...aRepl);
      } else {
        conflicts.push({ base: [tok], a: aRepl, b: bRepl, at: i });
        merged.push({ conflict: true, a: aRepl, b: bRepl, base: [tok] });
      }
    }
  }

  return { merged, conflicts };
}

function sameTokens(x, y) {
  if (x.length !== y.length) return false;
  for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return false;
  return true;
}

/**
 * Turn a base vs other myers op-list into a per-base-index action list.
 * Each entry describes what happened to base[i]:
 *   - leading: tokens inserted *before* base[i] in the other doc
 *   - kind:    'keep' | 'replace' | 'delete'
 *   - replacement: only populated when kind==='replace'
 * A trailing index (== baseTokens.length) carries final inserts.
 */
function chunkifyByBase(baseTokens, ops) {
  const chunks = new Array(baseTokens.length + 1);
  for (let i = 0; i <= baseTokens.length; i++) {
    chunks[i] = { kind: i < baseTokens.length ? 'keep' : null, leading: [] };
  }

  let baseIdx = 0;
  let pendingInserts = [];
  for (const op of ops) {
    if (op.op === 'equal') {
      if (pendingInserts.length) {
        chunks[baseIdx].leading.push(...pendingInserts);
        pendingInserts = [];
      }
      baseIdx++;
    } else if (op.op === 'delete') {
      // base[baseIdx] was removed on this side
      if (pendingInserts.length) {
        // An insert+delete pair = replace
        chunks[baseIdx].kind = 'replace';
        chunks[baseIdx].replacement = pendingInserts.slice();
        pendingInserts = [];
      } else {
        chunks[baseIdx].kind = 'delete';
      }
      baseIdx++;
    } else if (op.op === 'insert') {
      pendingInserts.push(op.token);
    }
  }
  if (pendingInserts.length) {
    chunks[baseTokens.length].leading.push(...pendingInserts);
  }
  return chunks;
}

// ─────────────────────────────────────────────────────────────────────
// DocDiff class
// ─────────────────────────────────────────────────────────────────────

class DocDiff {

  constructor(opts = {}) {
    this.opts = opts;
    // Optional injected version store: Map<docId, Array<{version, content}>>
    this.versionStore = opts.versionStore || new Map();
    // Injectable "now" for deterministic tests.
    this.now = opts.now || (() => new Date());
  }

  // ─── 1. diffText ────────────────────────────────────────────────
  /**
   * Compute a diff between two strings.
   *
   * @param {string} textA
   * @param {string} textB
   * @param {object} [options]
   * @param {'word'|'line'|'char'|'sentence'} [options.granularity='word']
   * @param {'structured'|'unified'}          [options.output='structured']
   * @returns {Array|string} structured ops OR unified-diff string
   */
  diffText(textA, textB, options = {}) {
    const { granularity = 'word', output = 'structured' } = options;
    const tok = tokenizerFor(granularity);
    const a = tok(textA || '');
    const b = tok(textB || '');
    const ops = myersDiff(a, b);
    if (output === 'unified') {
      const joiner = granularity === 'line' ? '\n' : '';
      return renderUnified(ops, { joinWith: joiner });
    }
    return ops;
  }

  // ─── 2. myersDiff ───────────────────────────────────────────────
  /** Raw Myers diff on token arrays or strings (delegates to top-level). */
  myersDiff(a, b) {
    return myersDiff(a, b);
  }

  // ─── 3. highlightChanges ────────────────────────────────────────
  /**
   * Render redline output in one of several formats.
   *
   * @param {object} o
   * @param {string} o.textA
   * @param {string} o.textB
   * @param {'html'|'pdf'|'docx'|'markdown'} o.format
   * @param {'word'|'line'|'char'|'sentence'} [o.granularity='word']
   * @param {'inline'|'side-by-side'} [o.layout='inline']
   * @param {'ltr'|'rtl'} [o.dir]
   */
  highlightChanges({ textA, textB, format, granularity = 'word',
                     layout = 'inline', dir }) {
    const ops = this.diffText(textA || '', textB || '', { granularity });
    // Auto-detect direction if not given
    if (!dir) dir = containsHebrew(textA) || containsHebrew(textB) ? 'rtl' : 'ltr';

    switch (format) {
      case 'html':
        return layout === 'side-by-side'
          ? renderSideBySideHTML(ops, { dir })
          : renderInlineHTML(ops, { dir });
      case 'markdown':
        return renderMarkdown(ops);
      case 'docx':
        return renderDocx(ops);
      case 'pdf':
        return this.generateRedlinePDF(ops);
      default:
        throw new Error(
          `Unknown highlight format: ${format} | פורמט לא נתמך`
        );
    }
  }

  // ─── 4. semanticDiff ────────────────────────────────────────────
  /**
   * Compare two documents ignoring whitespace, punctuation and
   * (when Hebrew) niqqud. The returned ops describe MEANINGFUL
   * differences — a re-flowed paragraph with identical words emits
   * zero insert/delete ops.
   */
  semanticDiff({ docA, docB }) {
    const normalize = (s) => {
      if (s == null) return '';
      let out = String(s);
      out = stripNiqqud(out);
      // Collapse whitespace, trim punctuation into lone tokens that
      // we then drop post-tokenization.
      return out;
    };

    const tok = tokenizeWord;
    const a = tok(normalize(docA)).filter(t => /[\p{L}\p{N}]/u.test(t));
    const b = tok(normalize(docB)).filter(t => /[\p{L}\p{N}]/u.test(t));
    const ops = myersDiff(a, b);
    const counts = countChanges(ops);
    return {
      ops,
      identical: counts.inserts === 0 && counts.deletes === 0,
      summary: {
        wordsAdded: counts.inserts,
        wordsRemoved: counts.deletes,
        wordsUnchanged: counts.equals,
      },
    };
  }

  // ─── 5. contractDiff ────────────────────────────────────────────
  /**
   * Compare two contract documents clause-by-clause.
   *
   * Each contract is expected to be an object keyed by clause name:
   *   { "payment": "...", "termination": "...", ... }
   * or an array of { name, text } objects. The clauseLibrary maps
   * clause names to risk weights and bilingual labels.
   */
  contractDiff({ contractA, contractB, clauseLibrary = {} }) {
    const mapA = this._clausesToMap(contractA);
    const mapB = this._clausesToMap(contractB);
    const allKeys = new Set([...Object.keys(mapA), ...Object.keys(mapB)]);

    const clauses = [];
    let addedCount = 0, removedCount = 0, changedCount = 0;
    let riskDelta = 0;

    for (const key of allKeys) {
      const a = mapA[key];
      const b = mapB[key];
      const weight = clauseRiskWeight(key, clauseLibrary);

      if (a == null && b != null) {
        clauses.push({ key, status: 'added', weight, text: b });
        addedCount++;
        riskDelta += weight;
        continue;
      }
      if (a != null && b == null) {
        clauses.push({ key, status: 'removed', weight, text: a });
        removedCount++;
        riskDelta -= weight;
        continue;
      }
      if (a === b) {
        clauses.push({ key, status: 'unchanged', weight });
        continue;
      }
      const ops = this.diffText(a, b, { granularity: 'word' });
      const counts = countChanges(ops);
      if (counts.inserts === 0 && counts.deletes === 0) {
        clauses.push({ key, status: 'unchanged', weight });
      } else {
        clauses.push({ key, status: 'changed', weight, ops, counts });
        changedCount++;
        // Changed clauses contribute half-weight to the delta
        riskDelta += Math.round(weight / 2);
      }
    }

    // Risk category
    const abs = Math.abs(riskDelta);
    let riskLevel;
    if      (abs === 0)  riskLevel = 'none';
    else if (abs <= 5)   riskLevel = 'low';
    else if (abs <= 15)  riskLevel = 'medium';
    else                 riskLevel = 'high';

    return {
      clauses,
      summary: {
        added: addedCount,
        removed: removedCount,
        changed: changedCount,
        unchanged: clauses.filter(c => c.status === 'unchanged').length,
      },
      riskDelta,
      riskLevel,
      riskLevelLabel: {
        en: `Risk delta: ${riskLevel}`,
        he: `דלתא סיכון: ${
          riskLevel === 'none'   ? 'אין'  :
          riskLevel === 'low'    ? 'נמוך' :
          riskLevel === 'medium' ? 'בינוני' : 'גבוה'
        }`,
      },
    };
  }

  _clausesToMap(contract) {
    if (!contract) return {};
    if (Array.isArray(contract)) {
      const m = {};
      for (const item of contract) {
        if (item && item.name) m[item.name] = item.text != null ? String(item.text) : '';
      }
      return m;
    }
    if (typeof contract === 'object') {
      const m = {};
      for (const [k, v] of Object.entries(contract)) {
        m[k] = typeof v === 'string' ? v : (v && v.text) || '';
      }
      return m;
    }
    return {};
  }

  // ─── 6. approvalTrackChanges ────────────────────────────────────
  /**
   * Wrap a structured diff so each op can be individually accepted
   * or rejected. Returns a tracker object:
   *
   *   .ops              — array with {id, op, token, status:'pending'|'accepted'|'rejected'}
   *   .accept(id)       — mark one op accepted
   *   .reject(id)       — mark one op rejected
   *   .acceptAll()      — accept everything pending
   *   .rejectAll()      — reject everything pending
   *   .resolve()        — returns the final text with pending = accepted
   *   .pendingCount()
   *   .isResolved()
   */
  approvalTrackChanges(diff) {
    const ops = (Array.isArray(diff) ? diff : []).map((o, i) => ({
      id: i,
      op: o.op,
      token: o.token,
      status: 'pending',
      createdAt: this.now().toISOString(),
    }));

    const tracker = {
      ops,
      accept(id) {
        const op = ops.find(o => o.id === id);
        if (op) op.status = 'accepted';
        return this;
      },
      reject(id) {
        const op = ops.find(o => o.id === id);
        if (op) op.status = 'rejected';
        return this;
      },
      acceptAll() {
        for (const op of ops) if (op.status === 'pending') op.status = 'accepted';
        return this;
      },
      rejectAll() {
        for (const op of ops) if (op.status === 'pending') op.status = 'rejected';
        return this;
      },
      pendingCount() {
        return ops.filter(o => o.status === 'pending').length;
      },
      isResolved() {
        return ops.every(o => o.status !== 'pending');
      },
      /**
       * Produce the textual output by applying the accept/reject decisions.
       * Pending ops are treated as ACCEPTED by default (safe on save).
       */
      resolve(joiner = '') {
        const out = [];
        for (const o of ops) {
          if (o.op === 'equal') {
            out.push(o.token);
          } else if (o.op === 'insert') {
            if (o.status !== 'rejected') out.push(o.token);
          } else if (o.op === 'delete') {
            // Deletion kept when accepted (i.e. the token is removed).
            if (o.status === 'rejected') out.push(o.token);
          }
        }
        return out.join(joiner);
      },
      history: [{ at: this.now().toISOString(), action: 'created', count: ops.length }],
    };
    return tracker;
  }

  // ─── 7. generateRedlinePDF ──────────────────────────────────────
  /**
   * Generate a bilingual redline PDF (title bar + each op on its own line).
   * Returns a Buffer with a complete, valid PDF stream.
   */
  generateRedlinePDF(diff) {
    const lines = [];
    lines.push('DocDiff Redline Report / דו"ח שינויים');
    lines.push('-----------------------------------');
    const ops = Array.isArray(diff) ? diff : [];
    for (const op of ops) {
      const marker =
        op.op === 'equal'  ? '  ' :
        op.op === 'insert' ? '+ ' :
        op.op === 'delete' ? '- ' : '? ';
      // Trim noisy whitespace tokens for readability
      const t = String(op.token || '').replace(/\r?\n/g, ' ');
      lines.push(`${marker}${t}`);
    }
    const counts = countChanges(ops);
    lines.push('-----------------------------------');
    lines.push(
      `Summary: ${counts.inserts} added, ${counts.deletes} removed, ` +
      `${counts.equals} unchanged`
    );
    lines.push(
      `סיכום: ${counts.inserts} נוספו, ${counts.deletes} הוסרו, ` +
      `${counts.equals} ללא שינוי`
    );
    return buildMinimalPDF('DocDiff Redline', lines);
  }

  // ─── 8. summarize ───────────────────────────────────────────────
  /**
   * Produce a bilingual short summary of a diff. Accepts either a raw
   * diff (array) or a contractDiff result.
   */
  summarize(diff) {
    // contractDiff shape
    if (diff && diff.summary && 'riskLevel' in diff) {
      const { added, removed, changed, unchanged } = diff.summary;
      const risk = diff.riskLevel;
      const riskHE =
        risk === 'none'   ? 'אין' :
        risk === 'low'    ? 'נמוך' :
        risk === 'medium' ? 'בינוני' : 'גבוה';
      return {
        en:
          `${changed} clauses changed, ${added} added, ${removed} removed, ` +
          `${unchanged} unchanged, ${risk} risk delta`,
        he:
          `${changed} סעיפים שונו, ${added} נוספו, ${removed} הוסרו, ` +
          `${unchanged} ללא שינוי, דלתא סיכון ${riskHE}`,
        counts: { added, removed, changed, unchanged },
        riskDelta: diff.riskDelta,
        riskLevel: diff.riskLevel,
      };
    }

    // raw diff shape
    const ops = Array.isArray(diff) ? diff : (diff && diff.ops) || [];
    const counts = countChanges(ops);
    return {
      en:
        `${counts.inserts} tokens added, ${counts.deletes} removed, ` +
        `${counts.equals} unchanged`,
      he:
        `${counts.inserts} אסימונים נוספו, ${counts.deletes} הוסרו, ` +
        `${counts.equals} ללא שינוי`,
      counts,
    };
  }

  // ─── 9. structuralDiff ──────────────────────────────────────────
  /**
   * Compare two JSON-like structures. Returns an array of JSON-Patch-like
   * change records: {op, path, from, to, value}.
   */
  structuralDiff({ jsonA, jsonB }) {
    return structuralDiffImpl(jsonA, jsonB, '');
  }

  // ─── 10. versionChain ───────────────────────────────────────────
  /**
   * Diff every consecutive version in the injected version store.
   * Expects store to be a Map<docId, Array<{version, content, createdAt}>>.
   * Returns an array with per-step diffs.
   */
  versionChain(docId, options = {}) {
    const { granularity = 'word' } = options;
    const versions = this.versionStore.get(docId) || [];
    if (versions.length < 2) return [];

    const out = [];
    for (let i = 1; i < versions.length; i++) {
      const prev = versions[i - 1];
      const cur  = versions[i];
      const ops  = this.diffText(prev.content || '', cur.content || '',
                                 { granularity });
      out.push({
        from: prev.version,
        to:   cur.version,
        fromAt: prev.createdAt || null,
        toAt:   cur.createdAt  || null,
        ops,
        counts: countChanges(ops),
      });
    }
    return out;
  }

  /** Append a new version to the chain (append-only, never mutates prior). */
  addVersion(docId, content, version) {
    if (!this.versionStore.has(docId)) this.versionStore.set(docId, []);
    const arr = this.versionStore.get(docId);
    arr.push({
      version: version != null ? version : arr.length + 1,
      content: String(content),
      createdAt: this.now().toISOString(),
    });
    return arr.length;
  }

  // ─── 11. mergeConflict (three-way) ──────────────────────────────
  /**
   * Three-way merge on line granularity (the most useful default for
   * structured documents). Returns:
   *
   *   {
   *     merged: string,        // reconstructed merged text, <<<<<< blocks
   *                            // inserted around conflict regions
   *     conflicts: Array<{...}>,
   *     hasConflicts: boolean,
   *     structured: Array,     // pre-stringification tokens w/ conflict marks
   *   }
   */
  mergeConflict({ base, a, b, granularity = 'line' }) {
    const tok = tokenizerFor(granularity);
    const baseT = tok(base || '');
    const aT    = tok(a    || '');
    const bT    = tok(b    || '');

    const { merged: structured, conflicts } =
      threeWayMergeTokens(baseT, aT, bT);

    // Stringify with git-style conflict markers around any conflict cells.
    const joiner = granularity === 'line' ? '\n' : '';
    const parts = [];
    for (const item of structured) {
      if (item && typeof item === 'object' && item.conflict) {
        parts.push(
          [
            '<<<<<<< A',
            item.a.join(joiner),
            '=======',
            item.b.join(joiner),
            '>>>>>>> B',
          ].join('\n')
        );
      } else {
        parts.push(item);
      }
    }

    return {
      merged: parts.join(joiner),
      conflicts,
      hasConflicts: conflicts.length > 0,
      structured,
    };
  }

  // ─── 12. hebrewAwareDiff ────────────────────────────────────────
  /**
   * Diff two strings with niqqud and bidi-control insensitivity. The
   * returned ops still carry the ORIGINAL tokens from textB (so niqqud
   * is preserved when it exists on an inserted word) — only comparison
   * happens on the stripped copies.
   */
  hebrewAwareDiff(textA, textB, options = {}) {
    const { granularity = 'word' } = options;
    const tok = tokenizerFor(granularity);
    const origA = tok(textA || '');
    const origB = tok(textB || '');
    const stripA = origA.map(stripNiqqud);
    const stripB = origB.map(stripNiqqud);

    const ops = myersDiff(stripA, stripB);

    // Re-attach original tokens: walk the ops list and map each token back
    // to the first untouched occurrence in the source array.
    let ai = 0, bi = 0;
    const restored = [];
    for (const op of ops) {
      if (op.op === 'equal') {
        // Prefer the b-side (newer) representation so inserted niqqud wins
        restored.push({ op: 'equal', token: origB[bi] });
        ai++; bi++;
      } else if (op.op === 'delete') {
        restored.push({ op: 'delete', token: origA[ai] });
        ai++;
      } else if (op.op === 'insert') {
        restored.push({ op: 'insert', token: origB[bi] });
        bi++;
      }
    }
    return {
      ops: restored,
      direction: 'rtl',
      containsHebrew: containsHebrew(textA) || containsHebrew(textB),
      counts: countChanges(restored),
    };
  }
}

// ─────────────────────────────────────────────────────────────────────
// Exports
// ─────────────────────────────────────────────────────────────────────

module.exports = {
  DocDiff,
  // helper exports for tests + callers who want the raw primitives
  myersDiff,
  tokenizeWord,
  tokenizeLine,
  tokenizeChar,
  tokenizeSentence,
  stripNiqqud,
  containsHebrew,
  structuralDiff: structuralDiffImpl,
  countChanges,
  toHunks,
  renderInlineHTML,
  renderSideBySideHTML,
  renderMarkdown,
  renderDocx,
  buildMinimalPDF,
};
