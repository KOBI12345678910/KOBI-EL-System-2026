/**
 * Search Engine — Zero-dep full-text inverted index for Techno-Kol ERP
 * Agent X-14 — Techno-Kol Uzi / Swarm 3
 *
 * Full-text search engine that indexes every ERP entity: invoices, clients,
 * vendors, items, employees, contracts, documents. Bilingual (Hebrew +
 * English) with niqqud stripping, final-letter normalization, stopwords,
 * TF-IDF scoring, phrase / boolean / fuzzy / prefix search, faceting and
 * hit highlighting.
 *
 *   מנוע חיפוש מלא לכל ישויות ה-ERP:
 *   חשבוניות, לקוחות, ספקים, פריטים, עובדים, חוזים, מסמכים.
 *   זיכרון בלבד, ללא תלויות חיצוניות, תומך עברית מלא כולל ניקוד,
 *   אותיות סופיות, מילות-עצירה, ציון TF-IDF ודירוג חכם.
 *
 * Run:   node --test test/payroll/search-engine.test.js
 * Node:  >= 18 (uses built-in Map / Set only — no external deps)
 *
 * Usage:
 *   const { createIndex } = require('./search-engine');
 *   const idx = createIndex();
 *   idx.add('inv-1', 'invoice', { title: 'חשבונית שיווקית', amount: 1200 });
 *   idx.search('חשבונית', { limit: 10 });
 *
 * API surface:
 *   createIndex()                  → SearchIndex
 *   index.add(id, docType, fields) → void
 *   index.remove(id)               → void
 *   index.search(query, opts)      → { results, total, facets, took_ms }
 *   index.suggest(prefix, limit)   → string[]
 *   tokenizeHebrew(str)            → string[]
 *   tokenizeEnglish(str)           → string[]
 */

'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// 1. CONSTANTS — Hebrew alphabet / niqqud / stopwords / final letters
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Unicode ranges for Hebrew niqqud (vowel points) and cantillation marks.
 * U+0591..U+05BD, U+05BF, U+05C1..U+05C2, U+05C4..U+05C5, U+05C7
 * Source: Unicode Standard — Hebrew block.
 */
const NIQQUD_RE = /[\u0591-\u05BD\u05BF\u05C1\u05C2\u05C4\u05C5\u05C7]/g;

/**
 * Final letters map — normalizes final form to non-final form so that
 * "שלום" and "שלומ" match the same token.
 */
const FINAL_LETTERS = Object.freeze({
  'ם': 'מ', // mem sofit
  'ן': 'נ', // nun sofit
  'ץ': 'צ', // tsadi sofit
  'ף': 'פ', // pe sofit
  'ך': 'כ', // kaf sofit
});

/**
 * Hebrew stopwords — extremely common function words that carry little
 * search signal. Drawn from common Israeli Hebrew corpora.
 */
const HEBREW_STOPWORDS = new Set([
  'של', 'את', 'עם', 'זה', 'זו', 'זאת', 'הוא', 'היא', 'הם', 'הן',
  'על', 'אל', 'אם', 'כי', 'או', 'גם', 'לא', 'כן', 'יש', 'אין',
  'עוד', 'כמו', 'אחרי', 'לפני', 'בין', 'תחת', 'מעל', 'אצל',
  'לי', 'לך', 'לו', 'לה', 'לנו', 'לכם', 'להם', 'להן',
  'אני', 'אתה', 'את', 'אנחנו', 'אתם', 'אתן',
  'ה', 'ו', 'ב', 'ל', 'מ', 'ש', 'כ',
  'מה', 'מי', 'איך', 'למה', 'איפה', 'מתי',
  'אבל', 'כדי', 'רק', 'עד', 'כבר', 'אולי',
]);

/**
 * English stopwords — standard subset.
 */
const ENGLISH_STOPWORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from',
  'has', 'have', 'he', 'in', 'is', 'it', 'its', 'of', 'on', 'that',
  'the', 'to', 'was', 'were', 'will', 'with', 'or', 'but', 'not',
  'this', 'these', 'those', 'they', 'them', 'their', 'there', 'than',
  'then', 'so', 'if', 'into', 'out', 'up', 'down', 'over', 'under',
  'do', 'does', 'did', 'can', 'could', 'would', 'should', 'about',
]);

/**
 * Entity types supported by the index — used for faceting and schema hints.
 */
const ENTITY_TYPES = Object.freeze([
  'invoice',
  'client',
  'vendor',
  'item',
  'employee',
  'contract',
  'document',
]);

// ═══════════════════════════════════════════════════════════════════════════
// 2. TOKENIZATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Strip Hebrew niqqud (vowel points) from a string.
 * "שָׁלוֹם" → "שלום"
 *
 * @param {string} str
 * @returns {string}
 */
function stripNiqqud(str) {
  if (typeof str !== 'string') return '';
  return str.replace(NIQQUD_RE, '');
}

/**
 * Normalize Hebrew final letters to their non-final form.
 * "שלום" → "שלומ", "חן" → "חנ"
 *
 * @param {string} str
 * @returns {string}
 */
function normalizeFinalLetters(str) {
  if (typeof str !== 'string') return '';
  let out = '';
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    out += FINAL_LETTERS[ch] || ch;
  }
  return out;
}

/**
 * Detect whether a character is a Hebrew letter (U+05D0..U+05EA).
 */
function isHebrewChar(ch) {
  const c = ch.charCodeAt(0);
  return c >= 0x05D0 && c <= 0x05EA;
}

/**
 * Detect whether a character is an ASCII letter or digit.
 */
function isAsciiAlnum(ch) {
  const c = ch.charCodeAt(0);
  return (
    (c >= 48 && c <= 57) ||    // 0-9
    (c >= 65 && c <= 90) ||    // A-Z
    (c >= 97 && c <= 122)      // a-z
  );
}

/**
 * Tokenize Hebrew text.
 *   1. Strip niqqud.
 *   2. Normalize final letters.
 *   3. Split on whitespace + punctuation.
 *   4. Remove stopwords.
 *   5. Drop empty tokens.
 *
 * @param {string} str
 * @returns {string[]}
 */
function tokenizeHebrew(str) {
  if (typeof str !== 'string' || str.length === 0) return [];
  const stripped = stripNiqqud(str);
  const normalized = normalizeFinalLetters(stripped);

  const tokens = [];
  let buf = '';
  for (let i = 0; i < normalized.length; i++) {
    const ch = normalized[i];
    if (isHebrewChar(ch) || isAsciiAlnum(ch)) {
      buf += ch;
    } else {
      if (buf.length > 0) {
        tokens.push(buf);
        buf = '';
      }
    }
  }
  if (buf.length > 0) tokens.push(buf);

  const out = [];
  for (const t of tokens) {
    const lower = t.toLowerCase();
    if (lower.length === 0) continue;
    if (HEBREW_STOPWORDS.has(lower)) continue;
    if (ENGLISH_STOPWORDS.has(lower)) continue;
    out.push(lower);
  }
  return out;
}

/**
 * Minimal stemming stub for English — strips common suffixes.
 * Not Porter-grade but avoids a dep and handles common cases:
 *   ing, ings, ed, es, s, ly, ment, ness
 */
function stemEnglish(word) {
  if (word.length <= 3) return word;
  const suffixes = ['ingly', 'ings', 'ness', 'ment', 'ing', 'ed', 'ly', 'es', 's'];
  for (const suf of suffixes) {
    if (word.length > suf.length + 2 && word.endsWith(suf)) {
      return word.slice(0, -suf.length);
    }
  }
  return word;
}

/**
 * Tokenize English text.
 *   1. Lowercase.
 *   2. Split on non-alnum.
 *   3. Remove stopwords.
 *   4. Apply stemming stub.
 *
 * @param {string} str
 * @returns {string[]}
 */
function tokenizeEnglish(str) {
  if (typeof str !== 'string' || str.length === 0) return [];
  const tokens = [];
  let buf = '';
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (isAsciiAlnum(ch)) {
      buf += ch.toLowerCase();
    } else {
      if (buf.length > 0) { tokens.push(buf); buf = ''; }
    }
  }
  if (buf.length > 0) tokens.push(buf);

  const out = [];
  for (const t of tokens) {
    if (t.length === 0) continue;
    if (ENGLISH_STOPWORDS.has(t)) continue;
    out.push(stemEnglish(t));
  }
  return out;
}

/**
 * Auto-detecting tokenizer: runs both tokenizers and unions the result so
 * mixed Hebrew+English strings work naturally. The Hebrew tokenizer already
 * preserves ASCII runs, but stemming only runs from the English path.
 *
 * @param {string} str
 * @returns {string[]}
 */
function tokenizeAny(str) {
  if (typeof str !== 'string' || str.length === 0) return [];
  const hasHebrew = /[\u05D0-\u05EA]/.test(str);
  if (hasHebrew) {
    // Hebrew tokenizer already captures ASCII runs untouched.
    return tokenizeHebrew(str);
  }
  return tokenizeEnglish(str);
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. FUZZY MATCHING — bounded Levenshtein
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Bounded Levenshtein edit distance. Returns Infinity once the minimum
 * across a row exceeds `maxDistance`, so the worst case is O(n * maxDist).
 *
 * @param {string} a
 * @param {string} b
 * @param {number} maxDistance
 * @returns {number}
 */
function levenshtein(a, b, maxDistance = 2) {
  if (a === b) return 0;
  const la = a.length, lb = b.length;
  if (Math.abs(la - lb) > maxDistance) return Infinity;
  if (la === 0) return lb <= maxDistance ? lb : Infinity;
  if (lb === 0) return la <= maxDistance ? la : Infinity;

  let prev = new Array(lb + 1);
  let curr = new Array(lb + 1);
  for (let j = 0; j <= lb; j++) prev[j] = j;

  for (let i = 1; i <= la; i++) {
    curr[0] = i;
    let rowMin = curr[0];
    const ca = a.charCodeAt(i - 1);
    for (let j = 1; j <= lb; j++) {
      const cost = ca === b.charCodeAt(j - 1) ? 0 : 1;
      const del = prev[j] + 1;
      const ins = curr[j - 1] + 1;
      const sub = prev[j - 1] + cost;
      curr[j] = del < ins ? (del < sub ? del : sub) : (ins < sub ? ins : sub);
      if (curr[j] < rowMin) rowMin = curr[j];
    }
    if (rowMin > maxDistance) return Infinity;
    const tmp = prev; prev = curr; curr = tmp;
  }
  return prev[lb] <= maxDistance ? prev[lb] : Infinity;
}

// ═══════════════════════════════════════════════════════════════════════════
// 4. QUERY PARSER — phrase / boolean / prefix / fuzzy
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Parse a raw query string into structured clauses.
 *
 * Syntax:
 *   "exact phrase"   → phrase clause
 *   +term            → required (AND)
 *   -term            → excluded (NOT)
 *   term*            → prefix search
 *   term~            → fuzzy (Levenshtein ≤ 2)
 *   OR               → toggles next clause to OR
 *   plain term       → AND by default
 *
 * @param {string} query
 * @returns {{ clauses: Array<Object> }}
 */
function parseQuery(query) {
  const clauses = [];
  if (typeof query !== 'string' || query.trim().length === 0) {
    return { clauses };
  }

  let i = 0;
  const q = query.trim();
  let nextOp = 'AND';

  while (i < q.length) {
    const ch = q[i];

    if (ch === ' ' || ch === '\t' || ch === '\n') { i++; continue; }

    // Phrase clause
    if (ch === '"') {
      const end = q.indexOf('"', i + 1);
      if (end === -1) { i++; continue; }
      const phrase = q.slice(i + 1, end);
      clauses.push({ type: 'phrase', op: nextOp, value: phrase });
      nextOp = 'AND';
      i = end + 1;
      continue;
    }

    // Explicit prefix operators
    let op = nextOp;
    if (ch === '+') { op = 'AND'; i++; }
    else if (ch === '-') { op = 'NOT'; i++; }

    // Grab the next whitespace-bounded term
    let j = i;
    while (j < q.length && q[j] !== ' ' && q[j] !== '\t' && q[j] !== '\n' && q[j] !== '"') j++;
    const term = q.slice(i, j);
    i = j;

    if (term.length === 0) continue;

    // OR operator
    if (term === 'OR' || term === 'or' || term === 'או') {
      nextOp = 'OR';
      continue;
    }
    if (term === 'AND' || term === 'and' || term === 'ו') {
      nextOp = 'AND';
      continue;
    }
    if (term === 'NOT' || term === 'not' || term === 'לא') {
      nextOp = 'NOT';
      continue;
    }

    // Modifiers on term
    let modifier = 'term';
    let value = term;
    if (value.endsWith('*')) {
      modifier = 'prefix';
      value = value.slice(0, -1);
    } else if (value.endsWith('~')) {
      modifier = 'fuzzy';
      value = value.slice(0, -1);
    }

    if (value.length === 0) continue;
    clauses.push({ type: modifier, op, value });
    nextOp = 'AND';
  }

  return { clauses };
}

// ═══════════════════════════════════════════════════════════════════════════
// 5. HIGHLIGHTING
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Escape a string for literal use in a RegExp.
 */
function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Highlight matched tokens in a source string by wrapping with markers.
 * Matching is done against normalized forms so Hebrew with niqqud is still
 * highlighted. Case-insensitive for ASCII.
 *
 * @param {string} text
 * @param {string[]} terms   — already-tokenized query terms
 * @param {{ pre?: string, post?: string }} [opts]
 * @returns {string}
 */
function highlight(text, terms, opts = {}) {
  if (typeof text !== 'string' || text.length === 0) return '';
  if (!Array.isArray(terms) || terms.length === 0) return text;
  const pre = opts.pre || '<mark>';
  const post = opts.post || '</mark>';

  // Build a map from normalized token → original text span.
  // We walk the original string and for every contiguous alnum/Hebrew run we
  // check whether its normalized form (niqqud-stripped, final-letter-normalized,
  // lowercased, stemmed) matches any query term.
  const termSet = new Set(terms.map((t) => t.toLowerCase()));
  let out = '';
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (isHebrewChar(ch) || isAsciiAlnum(ch) || NIQQUD_RE.test(ch)) {
      // We cannot reuse NIQQUD_RE.test because it has /g state — reset.
      NIQQUD_RE.lastIndex = 0;
    }
    const code = ch.charCodeAt(0);
    const isNiqqud =
      (code >= 0x0591 && code <= 0x05BD) ||
      code === 0x05BF ||
      code === 0x05C1 ||
      code === 0x05C2 ||
      code === 0x05C4 ||
      code === 0x05C5 ||
      code === 0x05C7;

    if (isHebrewChar(ch) || isAsciiAlnum(ch) || isNiqqud) {
      let j = i;
      while (j < text.length) {
        const c = text[j];
        const cc = c.charCodeAt(0);
        const nq =
          (cc >= 0x0591 && cc <= 0x05BD) ||
          cc === 0x05BF ||
          cc === 0x05C1 ||
          cc === 0x05C2 ||
          cc === 0x05C4 ||
          cc === 0x05C5 ||
          cc === 0x05C7;
        if (!isHebrewChar(c) && !isAsciiAlnum(c) && !nq) break;
        j++;
      }
      const span = text.slice(i, j);
      const norm = normalizeFinalLetters(stripNiqqud(span)).toLowerCase();
      const stem = stemEnglish(norm);
      if (termSet.has(norm) || termSet.has(stem)) {
        out += pre + span + post;
      } else {
        // Prefix match for highlight
        let matched = false;
        for (const t of termSet) {
          if (t.length > 0 && norm.startsWith(t)) { matched = true; break; }
        }
        out += matched ? pre + span + post : span;
      }
      i = j;
    } else {
      out += ch;
      i++;
    }
  }
  return out;
}

// ═══════════════════════════════════════════════════════════════════════════
// 6. SEARCH INDEX
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Create a new in-memory inverted index.
 *
 * Internally:
 *   - docs            : Map<docId, DocRecord>         — full doc payloads
 *   - invertedIndex   : Map<term, Map<docId, freq>>  — term → postings
 *   - termDocCount    : Map<term, number>             — DF cache
 *   - docLength       : Map<docId, number>            — token length
 *   - totalTokens     : number                        — corpus stats
 *
 * DocRecord shape:
 *   {
 *     id, docType, fields, tokens: string[],
 *     createdAt, updatedAt, user
 *   }
 */
function createIndex() {
  const docs = new Map();
  const invertedIndex = new Map();
  const termDocCount = new Map();
  const docLength = new Map();
  let totalTokens = 0;

  /**
   * Recursively collect stringifiable field values from a document.
   */
  function collectFieldStrings(fields, out) {
    if (fields == null) return;
    if (typeof fields === 'string') { out.push(fields); return; }
    if (typeof fields === 'number' || typeof fields === 'boolean') {
      out.push(String(fields));
      return;
    }
    if (Array.isArray(fields)) {
      for (const v of fields) collectFieldStrings(v, out);
      return;
    }
    if (typeof fields === 'object') {
      for (const k of Object.keys(fields)) collectFieldStrings(fields[k], out);
    }
  }

  /**
   * Add a document to the index. If `id` already exists, it is first
   * removed (upsert semantics). We NEVER delete physical data — `remove`
   * only unindexes; external callers hold the source of truth.
   */
  function add(id, docType, fields) {
    if (id == null || id === '') throw new Error('search.add: id required');
    if (typeof docType !== 'string' || docType.length === 0) {
      throw new Error('search.add: docType required');
    }
    // Upsert: remove any prior version from the inverted postings.
    if (docs.has(id)) remove(id);

    const strings = [];
    collectFieldStrings(fields, strings);
    const joined = strings.join(' ');
    const tokens = tokenizeAny(joined);

    const meta = (fields && typeof fields === 'object' && !Array.isArray(fields))
      ? fields
      : {};
    const createdAt = meta.createdAt || meta.created_at || null;
    const updatedAt = meta.updatedAt || meta.updated_at || null;
    const user = meta.user || meta.userId || meta.user_id || null;

    const record = {
      id,
      docType,
      fields,
      tokens,
      createdAt,
      updatedAt,
      user,
    };
    docs.set(id, record);
    docLength.set(id, tokens.length);
    totalTokens += tokens.length;

    // Populate postings with term frequencies.
    const freqs = new Map();
    for (const t of tokens) freqs.set(t, (freqs.get(t) || 0) + 1);
    for (const [term, freq] of freqs) {
      let posting = invertedIndex.get(term);
      if (!posting) {
        posting = new Map();
        invertedIndex.set(term, posting);
      }
      posting.set(id, freq);
      termDocCount.set(term, (termDocCount.get(term) || 0) + 1);
    }
  }

  /**
   * Unindex a document. Does NOT touch external storage — the original
   * payload remains wherever the caller keeps it.
   */
  function remove(id) {
    const record = docs.get(id);
    if (!record) return;
    const seen = new Set();
    for (const t of record.tokens) {
      if (seen.has(t)) continue;
      seen.add(t);
      const posting = invertedIndex.get(t);
      if (!posting) continue;
      if (posting.delete(id)) {
        const dc = (termDocCount.get(t) || 1) - 1;
        if (dc <= 0) termDocCount.delete(t);
        else termDocCount.set(t, dc);
      }
      if (posting.size === 0) invertedIndex.delete(t);
    }
    totalTokens -= (docLength.get(id) || 0);
    if (totalTokens < 0) totalTokens = 0;
    docLength.delete(id);
    docs.delete(id);
  }

  /**
   * Expand a single term into the set of matching docIds, given the
   * clause modifier (term | prefix | fuzzy).
   *
   * If the raw value itself tokenizes into multiple tokens (e.g. the query
   * "INV-2026-001" becomes ["inv","2026","001"] because of the dash
   * splitter), we treat them as an implicit AND over each sub-token and
   * return the intersection.
   *
   * @returns {Map<docId, tf>}  — matching postings with TF sums
   */
  function expandTerm(value, modifier) {
    const normQuery = normalizeFinalLetters(stripNiqqud(value)).toLowerCase();
    const stemmed = stemEnglish(normQuery);

    // Tokenize the value itself — handles dash-separated IDs, compound
    // strings, etc. Skip stopword filtering: if caller typed it, honor it.
    const subtokens = [];
    let buf = '';
    for (let i = 0; i < normQuery.length; i++) {
      const ch = normQuery[i];
      if (isHebrewChar(ch) || isAsciiAlnum(ch)) buf += ch;
      else if (buf.length) { subtokens.push(buf); buf = ''; }
    }
    if (buf.length) subtokens.push(buf);

    const result = new Map();

    if (modifier === 'term') {
      // Single whole-term lookup first (most precise)
      const posting = invertedIndex.get(normQuery) || invertedIndex.get(stemmed);
      if (posting) {
        for (const [id, tf] of posting) {
          result.set(id, (result.get(id) || 0) + tf);
        }
        if (result.size > 0) return result;
      }
      // Multi-subtoken AND fallback (for compound values like "INV-2026-001")
      if (subtokens.length > 1) {
        let intersection = null;
        for (const sub of subtokens) {
          const p = invertedIndex.get(sub) || invertedIndex.get(stemEnglish(sub));
          if (!p) return new Map();
          if (intersection === null) {
            intersection = new Map();
            for (const [id, tf] of p) intersection.set(id, tf);
          } else {
            const next = new Map();
            for (const [id, tf] of intersection) {
              const pf = p.get(id);
              if (pf != null) next.set(id, tf + pf);
            }
            intersection = next;
          }
          if (intersection.size === 0) return intersection;
        }
        return intersection || new Map();
      }
      return result;
    }

    if (modifier === 'prefix') {
      for (const [term, posting] of invertedIndex) {
        if (term.startsWith(normQuery)) {
          for (const [id, tf] of posting) {
            result.set(id, (result.get(id) || 0) + tf);
          }
        }
      }
      return result;
    }

    if (modifier === 'fuzzy') {
      const maxDist = normQuery.length <= 4 ? 1 : 2;
      for (const [term, posting] of invertedIndex) {
        if (levenshtein(term, normQuery, maxDist) !== Infinity) {
          for (const [id, tf] of posting) {
            result.set(id, (result.get(id) || 0) + tf);
          }
        }
      }
      return result;
    }

    return result;
  }

  /**
   * Phrase search — find docs where the phrase tokens appear in sequence
   * within the original field text. We re-tokenize each candidate's source
   * strings on demand since the inverted index is unordered.
   */
  function findPhrase(phrase) {
    const phraseTokens = tokenizeAny(phrase);
    if (phraseTokens.length === 0) return new Set();

    // Intersect postings of all phrase tokens — any hit doc must contain
    // every token.
    let candidateIds = null;
    for (const t of phraseTokens) {
      const posting = invertedIndex.get(t);
      if (!posting) return new Set();
      if (candidateIds === null) {
        candidateIds = new Set(posting.keys());
      } else {
        const next = new Set();
        for (const id of candidateIds) if (posting.has(id)) next.add(id);
        candidateIds = next;
      }
      if (candidateIds.size === 0) return new Set();
    }
    if (!candidateIds) return new Set();

    // Verify sequence order by re-tokenizing each candidate's field data.
    const hits = new Set();
    for (const id of candidateIds) {
      const doc = docs.get(id);
      if (!doc) continue;
      const strings = [];
      collectFieldStrings(doc.fields, strings);
      const haystack = tokenizeAny(strings.join(' '));
      if (containsSequence(haystack, phraseTokens)) hits.add(id);
    }
    return hits;
  }

  function containsSequence(haystack, needle) {
    if (needle.length === 0) return true;
    if (needle.length > haystack.length) return false;
    outer: for (let i = 0; i + needle.length <= haystack.length; i++) {
      for (let j = 0; j < needle.length; j++) {
        if (haystack[i + j] !== needle[j]) continue outer;
      }
      return true;
    }
    return false;
  }

  /**
   * Compute TF-IDF score for (doc, term) with standard log damping.
   */
  function tfidf(tf, term, docId) {
    const N = Math.max(docs.size, 1);
    const df = termDocCount.get(term) || 1;
    const idf = Math.log(1 + N / df);
    const normalizedTf = 1 + Math.log(1 + tf);
    // Small length normalization — longer docs shouldn't dominate.
    const len = docLength.get(docId) || 1;
    const lenNorm = 1 / (1 + Math.log(1 + len / 10));
    return normalizedTf * idf * lenNorm;
  }

  /**
   * Apply faceted filters on a candidate result set.
   *
   * filters = {
   *   docType?: string | string[],
   *   user?: string | string[],
   *   dateFrom?: string|Date,
   *   dateTo?: string|Date,
   * }
   */
  function passesFilters(record, filters) {
    if (!filters) return true;
    if (filters.docType) {
      const wanted = Array.isArray(filters.docType) ? filters.docType : [filters.docType];
      if (!wanted.includes(record.docType)) return false;
    }
    if (filters.user) {
      const wanted = Array.isArray(filters.user) ? filters.user : [filters.user];
      if (!wanted.includes(record.user)) return false;
    }
    if (filters.dateFrom || filters.dateTo) {
      const d = record.updatedAt || record.createdAt;
      if (!d) return false;
      const t = new Date(d).getTime();
      if (Number.isNaN(t)) return false;
      if (filters.dateFrom) {
        const from = new Date(filters.dateFrom).getTime();
        if (t < from) return false;
      }
      if (filters.dateTo) {
        const to = new Date(filters.dateTo).getTime();
        if (t > to) return false;
      }
    }
    return true;
  }

  function buildFacets(records) {
    const byType = {};
    const byUser = {};
    for (const r of records) {
      byType[r.docType] = (byType[r.docType] || 0) + 1;
      if (r.user) byUser[r.user] = (byUser[r.user] || 0) + 1;
    }
    return { docType: byType, user: byUser };
  }

  /**
   * Execute a search query.
   *
   * @param {string} query
   * @param {{
   *   limit?: number,
   *   offset?: number,
   *   filters?: Object,
   *   highlight?: boolean,
   *   highlightFields?: string[],
   * }} [opts]
   * @returns {{ results: Array, total: number, facets: Object, took_ms: number }}
   */
  function search(query, opts = {}) {
    const started = Date.now();
    const limit = Math.max(0, opts.limit == null ? 20 : opts.limit);
    const offset = Math.max(0, opts.offset || 0);
    const wantHighlight = opts.highlight !== false; // default true
    const { clauses } = parseQuery(query);

    // Empty query → return everything (filtered), most-recent first.
    if (clauses.length === 0) {
      const all = [];
      for (const r of docs.values()) {
        if (passesFilters(r, opts.filters)) all.push(r);
      }
      all.sort((a, b) => {
        const da = new Date(a.updatedAt || a.createdAt || 0).getTime();
        const db = new Date(b.updatedAt || b.createdAt || 0).getTime();
        return db - da;
      });
      const sliced = all.slice(offset, offset + limit);
      return {
        results: sliced.map((r) => ({
          id: r.id, docType: r.docType, score: 0, fields: r.fields, highlights: {},
        })),
        total: all.length,
        facets: buildFacets(all),
        took_ms: Date.now() - started,
      };
    }

    // Classify clauses by boolean op.
    const andExpansions = []; // Array<Map<id,tf>>
    const orExpansions = [];
    const notExpansions = [];
    const phraseHits = [];   // Array<Set<id>>
    const phraseNot = [];

    for (const c of clauses) {
      if (c.type === 'phrase') {
        const hits = findPhrase(c.value);
        if (c.op === 'NOT') phraseNot.push(hits);
        else phraseHits.push({ op: c.op, set: hits });
        continue;
      }
      const expanded = expandTerm(c.value, c.type);
      if (c.op === 'NOT') notExpansions.push(expanded);
      else if (c.op === 'OR') orExpansions.push(expanded);
      else andExpansions.push(expanded);
    }

    // Start with AND intersection (or OR union if no AND clauses).
    let candidateScores = new Map();
    let haveCandidates = false;

    if (andExpansions.length > 0) {
      // Start from first expansion, then intersect.
      const first = andExpansions[0];
      for (const [id, tf] of first) candidateScores.set(id, tf);
      for (let i = 1; i < andExpansions.length; i++) {
        const next = new Map();
        const exp = andExpansions[i];
        for (const [id, score] of candidateScores) {
          const tf = exp.get(id);
          if (tf != null) next.set(id, score + tf);
        }
        candidateScores = next;
      }
      haveCandidates = true;
    }

    // Apply phrase AND filters.
    for (const ph of phraseHits) {
      if (ph.op === 'OR' && !haveCandidates) {
        for (const id of ph.set) candidateScores.set(id, (candidateScores.get(id) || 0) + 1);
        haveCandidates = true;
        continue;
      }
      if (ph.op === 'OR') {
        for (const id of ph.set) candidateScores.set(id, (candidateScores.get(id) || 0) + 1);
        continue;
      }
      // AND intersection
      if (!haveCandidates) {
        for (const id of ph.set) candidateScores.set(id, 1);
        haveCandidates = true;
      } else {
        const next = new Map();
        for (const [id, score] of candidateScores) {
          if (ph.set.has(id)) next.set(id, score + 1);
        }
        candidateScores = next;
      }
    }

    // OR clauses union.
    for (const exp of orExpansions) {
      for (const [id, tf] of exp) {
        candidateScores.set(id, (candidateScores.get(id) || 0) + tf);
      }
      haveCandidates = true;
    }

    // NOT clauses remove.
    for (const exp of notExpansions) {
      for (const id of exp.keys()) candidateScores.delete(id);
    }
    for (const hits of phraseNot) {
      for (const id of hits) candidateScores.delete(id);
    }

    // Compute TF-IDF scores using expansions we already have.
    const scored = [];
    const queryTerms = new Set();
    for (const c of clauses) {
      if (c.op === 'NOT') continue;
      if (c.type === 'phrase') {
        for (const t of tokenizeAny(c.value)) queryTerms.add(t);
      } else {
        const t = normalizeFinalLetters(stripNiqqud(c.value)).toLowerCase();
        if (t) queryTerms.add(t);
      }
    }

    for (const [id, rawScore] of candidateScores) {
      const record = docs.get(id);
      if (!record) continue;
      if (!passesFilters(record, opts.filters)) continue;
      let score = 0;
      for (const term of queryTerms) {
        const posting = invertedIndex.get(term);
        const tf = posting && posting.get(id);
        if (tf) score += tfidf(tf, term, id);
      }
      // Phrase bonus — rawScore from phrase hits already weighted.
      score += rawScore * 0.1;
      scored.push({ record, score });
    }

    scored.sort((a, b) => b.score - a.score);
    const total = scored.length;
    const page = scored.slice(offset, offset + limit);

    // Build highlights.
    const results = page.map(({ record, score }) => {
      const highlights = {};
      if (wantHighlight) {
        const termList = Array.from(queryTerms);
        const visit = (obj, path) => {
          if (obj == null) return;
          if (typeof obj === 'string') {
            highlights[path] = highlight(obj, termList);
            return;
          }
          if (typeof obj === 'object' && !Array.isArray(obj)) {
            for (const k of Object.keys(obj)) {
              visit(obj[k], path ? `${path}.${k}` : k);
            }
          }
        };
        visit(record.fields, '');
      }
      return {
        id: record.id,
        docType: record.docType,
        score: Number(score.toFixed(6)),
        fields: record.fields,
        highlights,
      };
    });

    return {
      results,
      total,
      facets: buildFacets(scored.map((s) => s.record)),
      took_ms: Date.now() - started,
    };
  }

  /**
   * Autocomplete — return up to `limit` indexed terms starting with `prefix`,
   * sorted by document frequency descending.
   */
  function suggest(prefix, limit = 10) {
    if (typeof prefix !== 'string' || prefix.length === 0) return [];
    const norm = normalizeFinalLetters(stripNiqqud(prefix)).toLowerCase();
    const matches = [];
    for (const [term, posting] of invertedIndex) {
      if (term.startsWith(norm)) {
        matches.push({ term, df: posting.size });
      }
    }
    matches.sort((a, b) => b.df - a.df || a.term.localeCompare(b.term));
    return matches.slice(0, limit).map((m) => m.term);
  }

  /**
   * Basic index statistics for diagnostics.
   */
  function stats() {
    return {
      docs: docs.size,
      terms: invertedIndex.size,
      totalTokens,
      avgDocLength: docs.size === 0 ? 0 : totalTokens / docs.size,
    };
  }

  /**
   * Retrieve raw indexed record by id (for callers that want to hydrate).
   */
  function get(id) {
    return docs.get(id) || null;
  }

  return {
    add,
    remove,
    search,
    suggest,
    stats,
    get,
    // exposed for introspection / testing
    _invertedIndex: invertedIndex,
    _docs: docs,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 7. EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

module.exports = {
  createIndex,
  tokenizeHebrew,
  tokenizeEnglish,
  tokenizeAny,
  stripNiqqud,
  normalizeFinalLetters,
  stemEnglish,
  levenshtein,
  parseQuery,
  highlight,
  HEBREW_STOPWORDS,
  ENGLISH_STOPWORDS,
  ENTITY_TYPES,
};
