/**
 * Document Search Engine  |  מנוע חיפוש מסמכים
 * =============================================================
 *
 * Agent Y-112  |  Swarm Documents  |  Techno-Kol Uzi mega-ERP
 *
 * Bilingual (Hebrew RTL + English LTR) full-text search over the
 * ERP's document management stack. Complements:
 *
 *   • Y-106 `doc-vc`   — version control & revisions
 *   • Y-113 `metadata` — schemas, tags, facets
 *
 * Zero dependencies. Node built-ins only. In-memory storage.
 *
 * -------------------------------------------------------------
 * RULE: לא מוחקים רק משדרגים ומגדלים
 * -------------------------------------------------------------
 * Nothing in this module deletes raw data.
 *
 *   • indexDocument(...)   creates a new revision entry, appends
 *                          to the mutation log, and flips status
 *                          of any prior entry to `superseded`.
 *   • removeFromIndex(...) performs a SOFT unindex: the document
 *                          status flips to `archived`, postings
 *                          are excluded from live ranking but
 *                          preserved in the archive Map so that
 *                          audits and a future reindex(fullHistory:
 *                          true) can replay them.
 *   • reindex()            rebuilds the live postings from the
 *                          `_rawDocs` Map — never touches history.
 *
 * Every mutation goes through `_logMutation()` which appends an
 * entry to `_mutationLog` (append-only circular-safe).
 *
 * -------------------------------------------------------------
 * INDEX STRUCTURE
 * -------------------------------------------------------------
 *
 *   inverted: Map<term, Map<docId, Posting>>
 *
 *   Posting {
 *     docId,
 *     tf          — raw term frequency in this doc
 *     positions[] — token offsets inside the concatenated field
 *                   stream (title_he + title_en + content)
 *     field       — 'title_he' | 'title_en' | 'content' (first occ)
 *     status      — 'live' | 'archived' | 'superseded'
 *     versionId
 *   }
 *
 *   docLengths: Map<docId, number>   // token count for BM25
 *   docMeta:    Map<docId, {...metadata, tags, docType, department,
 *                           createdAt, versionId, status}>
 *   avgDocLen:  Number                // rolling average
 *   N:          Number                // live document count
 *
 *   archive:    Map<docId, Posting[]>   // soft-unindexed snapshots
 *   _rawDocs:   Map<docId, InputDocument>   // source for reindex
 *   _mutationLog: Array<{op, at, docId, versionId, seq}>
 *
 * -------------------------------------------------------------
 * BM25 FORMULA (Robertson/Spärck Jones)
 * -------------------------------------------------------------
 *
 *   score(D, Q) = Σ_{q in Q} IDF(q) · (tf(q,D) · (k1+1))
 *                               --------------------------
 *                               tf(q,D) + k1·(1 - b + b·|D|/avgdl)
 *
 *   IDF(q)      = ln( (N - df(q) + 0.5) / (df(q) + 0.5) + 1 )
 *
 *   with the standard parameters k1 = 1.2, b = 0.75.
 *
 * TF-IDF (classic, used as a fallback score and exposed via
 * `_scoreTfIdf` for callers that want the simpler signal):
 *
 *   tfidf(q, D) = (tf(q,D) / |D|) · ln( (N + 1) / (df(q) + 1) ) + 1
 *
 * -------------------------------------------------------------
 * BILINGUAL TOKENIZER
 * -------------------------------------------------------------
 *
 * Token categories recognised:
 *
 *   1. Hebrew word:       /[\u0590-\u05FF]+/
 *   2. Latin word:        /[A-Za-z]+/
 *   3. Digits:            /[0-9]+/
 *   4. Mixed alnum (IDs): /[A-Za-z0-9][A-Za-z0-9_-]+/
 *
 * Hebrew normalisation pipeline:
 *
 *   a. Strip nikud (U+0591..U+05C7)
 *   b. Strip maqaf, geresh, gershayim
 *   c. Strip Hebrew one-letter prefixes — ב ,כ ,ל ,מ ,ש ,ה ,ו —
 *      but only when the residue is ≥ 2 letters, to avoid
 *      destroying short stems like "הר" or "ים".
 *   d. Naive stem: strip trailing plural/possessive suffixes
 *      ("ים", "ות", "יה", "ון") when residue ≥ 3 letters.
 *
 * English normalisation:
 *
 *   a. Lowercase (`toLocaleLowerCase('en')`)
 *   b. Strip trailing "ing", "ed", "es", "s" when residue ≥ 3.
 *
 * Stop-words are language-aware; see `HEBREW_STOPWORDS` and
 * `ENGLISH_STOPWORDS`.
 *
 * -------------------------------------------------------------
 * PUBLIC API — class `DocSearch`
 * -------------------------------------------------------------
 *
 *   indexDocument({docId, title_he, title_en, content, metadata,
 *                  tags, versionId})
 *   removeFromIndex(docId, versionId)
 *   query(q, {filters, limit, offset, boost, scorer})
 *   queryHebrew(q, opts?)
 *   phraseQuery(phrase, opts?)
 *   fuzzySearch(q, {maxDistance})
 *   suggestCorrections(term, {limit, maxDistance})
 *   highlight(content, query, {pre, post})
 *   facets(query, opts?)
 *   autocomplete(prefix, limit)
 *   reindex({fullHistory?})
 *   stats()
 *
 * Every public method is side-effect-free with respect to the
 * input arguments. Every mutation logs through `_logMutation()`.
 *
 * -------------------------------------------------------------
 * SAFE HIGHLIGHTING
 * -------------------------------------------------------------
 *
 * `highlight()` HTML-escapes the source content BEFORE wrapping
 * matches, so arbitrary user input like `<script>` is rendered
 * as `&lt;script&gt;` and cannot inject markup. The wrapper tag
 * defaults to `<mark>…</mark>`.
 */

'use strict';

// ════════════════════════════════════════════════════════════
// Constants
// ════════════════════════════════════════════════════════════

const BM25_K1 = 1.2;
const BM25_B  = 0.75;

const STATUS_LIVE       = 'live';
const STATUS_ARCHIVED   = 'archived';
const STATUS_SUPERSEDED = 'superseded';

const FIELDS = Object.freeze(['title_he', 'title_en', 'content']);

// One-letter Hebrew prefixes that commonly attach to nouns/verbs.
// ב = "in", כ = "like/as", ל = "to", מ = "from", ש = "that",
// ה = "the", ו = "and".
const HEBREW_PREFIXES = Object.freeze(['ב', 'כ', 'ל', 'מ', 'ש', 'ה', 'ו']);

// Common plural/possessive Hebrew suffixes.
const HEBREW_SUFFIXES = Object.freeze(['ים', 'ות', 'יה', 'ון']);

const HEBREW_STOPWORDS = new Set([
  'של', 'על', 'עם', 'זה', 'זאת', 'אני', 'אתה', 'את', 'הוא', 'היא',
  'אנחנו', 'אתם', 'הם', 'הן', 'או', 'גם', 'כי', 'אם', 'לא', 'כן',
  'יש', 'אין', 'היה', 'הייתה',
]);

const ENGLISH_STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'of', 'in', 'on', 'at',
  'to', 'for', 'with', 'by', 'from', 'as', 'is', 'are', 'was',
  'were', 'be', 'been', 'being', 'it', 'this', 'that', 'these',
  'those', 'i', 'you', 'he', 'she', 'we', 'they',
]);

// ════════════════════════════════════════════════════════════
// Small utilities
// ════════════════════════════════════════════════════════════

function mkErr(code, message) {
  const e = new Error(message);
  e.code = code;
  return e;
}

/** True for a non-empty string. */
function isStr(v) { return typeof v === 'string' && v.length > 0; }

/** HTML-escape for safe highlighting. */
function escapeHtml(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Escape a literal for safe insertion into a RegExp. */
function escapeReg(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Return true iff the char at position i is a Hebrew letter. */
function isHebrewChar(ch) {
  const c = ch.charCodeAt(0);
  return c >= 0x0590 && c <= 0x05FF;
}

/** Strip Hebrew nikud and related diacritics. */
function stripNikud(s) {
  return s.replace(/[\u0591-\u05C7]/g, '');
}

/**
 * Strip Hebrew prefix letters when residue ≥ 3 chars. Returns the
 * stripped form. Callers that need BOTH forms (for dual-indexing)
 * should use `hebrewVariants`.
 */
function stripHebrewPrefix(word) {
  if (!isStr(word) || word.length < 4) return word;
  const first = word.charAt(0);
  if (HEBREW_PREFIXES.indexOf(first) !== -1) {
    return word.slice(1);
  }
  return word;
}

/** Strip a single common Hebrew plural/possessive suffix. */
function stripHebrewSuffix(word) {
  if (!isStr(word) || word.length < 4) return word;
  for (let i = 0; i < HEBREW_SUFFIXES.length; i++) {
    const suf = HEBREW_SUFFIXES[i];
    if (word.length >= suf.length + 2 && word.endsWith(suf)) {
      return word.slice(0, -suf.length);
    }
  }
  return word;
}

/**
 * Returns every Hebrew form that this token should index under.
 * Always includes the original. Adds prefix-stripped, suffix-stripped
 * and prefix+suffix-stripped variants when they differ and are ≥ 2
 * characters long.  Used for BOTH indexing AND querying so that a
 * query like "ברזל" can match an indexed occurrence of "לברזל".
 */
function hebrewVariants(word) {
  if (!isStr(word)) return [];
  const variants = new Set();
  variants.add(word);
  const a = stripHebrewPrefix(word);
  if (a && a.length >= 2) variants.add(a);
  const b = stripHebrewSuffix(word);
  if (b && b.length >= 2) variants.add(b);
  const c = stripHebrewSuffix(a);
  if (c && c.length >= 2) variants.add(c);
  return Array.from(variants);
}

/** Naive English stem. */
function stemEnglish(w) {
  if (w.length < 4) return w;
  if (w.endsWith('ing') && w.length > 5) return w.slice(0, -3);
  if (w.endsWith('ed')  && w.length > 4) return w.slice(0, -2);
  if (w.endsWith('es')  && w.length > 4) return w.slice(0, -2);
  if (w.endsWith('s')   && w.length > 3) return w.slice(0, -1);
  return w;
}

/** Levenshtein distance — classic O(m·n) DP, iterative. */
function levenshtein(a, b) {
  a = String(a == null ? '' : a);
  b = String(b == null ? '' : b);
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  const m = a.length;
  const n = b.length;
  let prev = new Array(n + 1);
  let curr = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      curr[j] = Math.min(
        curr[j - 1] + 1,       // insertion
        prev[j] + 1,           // deletion
        prev[j - 1] + cost,    // substitution
      );
    }
    const tmp = prev; prev = curr; curr = tmp;
  }
  return prev[n];
}

// ════════════════════════════════════════════════════════════
// Tokenizer
// ════════════════════════════════════════════════════════════

/**
 * Raw token extractor — pulls maximal runs of Hebrew letters,
 * Latin letters, or digits. Returns {token, start, end} objects
 * keyed by character offset in the source.
 *
 * Mixed alnum IDs like "PO-12345" become three sibling tokens:
 *   {po}, {12345}. Callers that need literal ID preservation
 * should use `phraseQuery` (positional index) or filters.
 */
function rawTokens(text) {
  if (!isStr(text)) return [];
  const normalized = stripNikud(text);
  const out = [];
  const re = /[\u0590-\u05FF]+|[A-Za-z]+|[0-9]+/g;
  let m;
  while ((m = re.exec(normalized)) !== null) {
    out.push({ token: m[0], start: m.index, end: m.index + m[0].length });
  }
  return out;
}

/**
 * Normalise a single token to its PRIMARY form.
 *
 *   • Hebrew  → strip nikud (already done); preserve the raw word
 *               as the primary form — prefix/suffix variants are
 *               produced separately by `normalizeTokens` so the
 *               index can contain BOTH the surface and the stem.
 *   • Latin   → lowercase → stem
 *   • Digits  → pass-through
 *
 * Returns `''` when the token collapses to a stop-word.
 */
function normalizeToken(tok) {
  if (!isStr(tok)) return '';
  if (isHebrewChar(tok.charAt(0))) {
    if (HEBREW_STOPWORDS.has(tok)) return '';
    return tok;
  }
  if (/^[A-Za-z]/.test(tok)) {
    const low = tok.toLowerCase();
    if (ENGLISH_STOPWORDS.has(low)) return '';
    return stemEnglish(low);
  }
  // digits → numeric ids, keep as-is
  return tok;
}

/**
 * Return every searchable form for a single raw token. For Hebrew
 * this includes the surface form AND all prefix/suffix-stripped
 * variants (see `hebrewVariants`). For English this is always a
 * single stemmed form. Empty result → stop-word.
 */
function normalizeTokens(tok) {
  if (!isStr(tok)) return [];
  if (isHebrewChar(tok.charAt(0))) {
    if (HEBREW_STOPWORDS.has(tok)) return [];
    const variants = hebrewVariants(tok);
    const out = [];
    for (let i = 0; i < variants.length; i++) {
      const v = variants[i];
      if (v && !HEBREW_STOPWORDS.has(v)) out.push(v);
    }
    return out;
  }
  if (/^[A-Za-z]/.test(tok)) {
    const low = tok.toLowerCase();
    if (ENGLISH_STOPWORDS.has(low)) return [];
    return [stemEnglish(low)];
  }
  return [tok];
}

/**
 * Full tokenize pipeline. Returns an array of normalised terms
 * in the same order as the source text.
 *
 * Hebrew raw tokens may produce MULTIPLE sibling terms sharing
 * the same ordinal (surface form + stripped variants), which
 * keeps recall high without distorting phrase adjacency — the
 * primary term always comes first so phrase queries still work.
 *
 * @param {string} text
 * @param {object} [opts]
 * @param {boolean} [opts.keepPositions=false]
 *    When true, returns {term, start, end, ordinal} records.
 */
function tokenize(text, opts) {
  const keepPositions = !!(opts && opts.keepPositions);
  const raw = rawTokens(text);
  const out = [];
  let ordinal = 0;
  for (let i = 0; i < raw.length; i++) {
    const r = raw[i];
    const variants = normalizeTokens(r.token);
    if (variants.length === 0) continue;
    for (let j = 0; j < variants.length; j++) {
      if (keepPositions) {
        out.push({
          term: variants[j],
          start: r.start,
          end: r.end,
          ordinal,
          primary: j === 0,
        });
      } else {
        out.push(variants[j]);
      }
    }
    ordinal++;
  }
  return out;
}

// ════════════════════════════════════════════════════════════
// Class
// ════════════════════════════════════════════════════════════

class DocSearch {
  constructor(opts) {
    const o = opts || {};
    this.k1 = typeof o.k1 === 'number' ? o.k1 : BM25_K1;
    this.b  = typeof o.b  === 'number' ? o.b  : BM25_B;
    this.now = typeof o.now === 'function' ? o.now : () => Date.now();

    // inverted index — term → Map<docId, Posting>
    this._index = new Map();
    // doc lengths for BM25 — docId → number
    this._docLen = new Map();
    // docId → {status, metadata, tags, docType, department, versionId, createdAt}
    this._docMeta = new Map();
    // docId → [InputDocument] preserved full history (append-only)
    this._rawDocs = new Map();
    // docId → [{postings snapshot, archivedAt, reason}] soft unindex
    this._archive = new Map();
    // append-only mutation log
    this._mutationLog = [];
    // monotonic sequence id for log ordering
    this._seq = 0;
    // rolling BM25 corpus stats
    this._totalLen = 0;
    this._N = 0;
  }

  // ─────────────────────────────────────────────────────────
  // Mutation log
  // ─────────────────────────────────────────────────────────
  _logMutation(op, docId, versionId, extra) {
    const entry = {
      seq: ++this._seq,
      at:  this.now(),
      op,
      docId,
      versionId: versionId == null ? null : versionId,
    };
    if (extra) Object.assign(entry, extra);
    this._mutationLog.push(entry);
    return entry;
  }

  getMutationLog() {
    return this._mutationLog.slice();
  }

  // ─────────────────────────────────────────────────────────
  // Indexing
  // ─────────────────────────────────────────────────────────

  /**
   * Index (or re-index) a document. Re-indexing the same docId
   * with a new versionId supersedes the prior postings — they
   * are copied to `_archive` and removed from live structures.
   * The source payload is preserved in `_rawDocs` indefinitely
   * (append-only, keyed by [docId, versionId]).
   */
  indexDocument(input) {
    if (!input || typeof input !== 'object') {
      throw mkErr('E_INPUT', 'indexDocument: input must be an object');
    }
    const docId = input.docId;
    if (!isStr(docId)) {
      throw mkErr('E_DOCID', 'indexDocument: docId is required');
    }
    const versionId = input.versionId || ('v' + (this._seq + 1));

    // Preserve raw input forever (append-only history).
    const history = this._rawDocs.get(docId) || [];
    history.push({
      versionId,
      at: this.now(),
      title_he: input.title_he || '',
      title_en: input.title_en || '',
      content:  input.content  || '',
      metadata: input.metadata ? JSON.parse(JSON.stringify(input.metadata)) : {},
      tags:     Array.isArray(input.tags) ? input.tags.slice() : [],
    });
    this._rawDocs.set(docId, history);

    // If the doc is already live, move its current postings to archive
    // and decrement corpus stats.
    if (this._docMeta.has(docId) && this._docMeta.get(docId).status === STATUS_LIVE) {
      this._archiveLive(docId, 'superseded');
    }

    // Concatenate fields in a fixed order so positions are stable.
    const parts = [];
    for (let i = 0; i < FIELDS.length; i++) {
      const v = input[FIELDS[i]];
      if (isStr(v)) parts.push(v);
    }
    const stream = parts.join(' \u2029 '); // paragraph sep — never a word

    // Tokenize with positions.
    const toks = tokenize(stream, { keepPositions: true });

    // Build per-term postings for this doc.
    const perTerm = new Map();
    for (let i = 0; i < toks.length; i++) {
      const t = toks[i];
      let p = perTerm.get(t.term);
      if (!p) {
        p = { docId, tf: 0, positions: [], field: FIELDS[0], status: STATUS_LIVE, versionId };
        perTerm.set(t.term, p);
      }
      p.tf++;
      p.positions.push(t.ordinal);
    }

    // Also index tags as first-class searchable terms so that
    // query/filter parity holds (tags come through the tokenizer).
    if (Array.isArray(input.tags)) {
      for (let i = 0; i < input.tags.length; i++) {
        const tagTokens = tokenize(String(input.tags[i]));
        for (let j = 0; j < tagTokens.length; j++) {
          const term = tagTokens[j];
          let p = perTerm.get(term);
          if (!p) {
            p = {
              docId, tf: 0, positions: [], field: 'tag',
              status: STATUS_LIVE, versionId,
            };
            perTerm.set(term, p);
          }
          p.tf++;
        }
      }
    }

    // Merge per-term postings into the global inverted index.
    for (const [term, posting] of perTerm) {
      let byDoc = this._index.get(term);
      if (!byDoc) { byDoc = new Map(); this._index.set(term, byDoc); }
      byDoc.set(docId, posting);
    }

    const docLen = toks.length || 1;
    this._docLen.set(docId, docLen);
    this._totalLen += docLen;
    this._N++;

    this._docMeta.set(docId, {
      status:     STATUS_LIVE,
      versionId,
      metadata:   input.metadata ? JSON.parse(JSON.stringify(input.metadata)) : {},
      tags:       Array.isArray(input.tags) ? input.tags.slice() : [],
      docType:    input.metadata && input.metadata.docType
        ? String(input.metadata.docType) : null,
      department: input.metadata && input.metadata.department
        ? String(input.metadata.department) : null,
      createdAt:  this.now(),
      titleHe:    input.title_he || '',
      titleEn:    input.title_en || '',
    });

    this._logMutation('index', docId, versionId, { terms: perTerm.size });
    return { docId, versionId, terms: perTerm.size, docLen };
  }

  /** Move a live doc's postings into the archive map. */
  _archiveLive(docId, reason) {
    const meta = this._docMeta.get(docId);
    if (!meta || meta.status !== STATUS_LIVE) return;
    const snapshot = [];
    for (const [term, byDoc] of this._index) {
      const p = byDoc.get(docId);
      if (p) {
        snapshot.push({ term, posting: { ...p, positions: p.positions.slice() } });
        byDoc.delete(docId);
        if (byDoc.size === 0) this._index.delete(term);
      }
    }
    const arch = this._archive.get(docId) || [];
    arch.push({ archivedAt: this.now(), reason, snapshot, versionId: meta.versionId });
    this._archive.set(docId, arch);
    const oldLen = this._docLen.get(docId) || 0;
    this._totalLen -= oldLen;
    this._N = Math.max(0, this._N - 1);
    this._docLen.delete(docId);
    const updated = { ...meta, status: reason === 'superseded' ? STATUS_SUPERSEDED : STATUS_ARCHIVED };
    this._docMeta.set(docId, updated);
  }

  /**
   * Soft-unindex: flips document status to `archived`. Never
   * deletes raw data. Postings snapshot is preserved in the
   * archive Map so a later `reindex({fullHistory: true})` can
   * replay the last known state.
   */
  removeFromIndex(docId, versionId) {
    if (!this._docMeta.has(docId)) {
      throw mkErr('E_NOT_FOUND', 'removeFromIndex: unknown docId ' + docId);
    }
    this._archiveLive(docId, 'archived');
    this._logMutation('archive', docId, versionId || null);
    return { docId, status: STATUS_ARCHIVED };
  }

  // ─────────────────────────────────────────────────────────
  // Scoring
  // ─────────────────────────────────────────────────────────

  _idfBm25(df) {
    const N = this._N || 1;
    return Math.log(((N - df + 0.5) / (df + 0.5)) + 1);
  }

  _avgDocLen() {
    return this._N > 0 ? this._totalLen / this._N : 1;
  }

  _scoreBm25(term, posting, dl, avgdl) {
    const byDoc = this._index.get(term);
    const df = byDoc ? byDoc.size : 0;
    if (df === 0) return 0;
    const idf = this._idfBm25(df);
    const tf = posting.tf;
    const num = tf * (this.k1 + 1);
    const den = tf + this.k1 * (1 - this.b + this.b * (dl / (avgdl || 1)));
    return idf * (num / (den || 1));
  }

  _scoreTfIdf(term, posting, dl) {
    const byDoc = this._index.get(term);
    const df = byDoc ? byDoc.size : 0;
    if (df === 0) return 0;
    const tf = posting.tf / (dl || 1);
    const idf = Math.log((this._N + 1) / (df + 1)) + 1;
    return tf * idf;
  }

  // ─────────────────────────────────────────────────────────
  // Query
  // ─────────────────────────────────────────────────────────

  /**
   * Primary query entry point.
   *
   *   q        string query — tokenized through the bilingual pipeline
   *   opts.filters
   *     .docType    string | string[]
   *     .tags       string | string[]  (ANY match; all must be present
   *                                     when `tags.mode === 'all'`)
   *     .department string | string[]
   *     .dateRange  {from?, to?}  — inclusive epoch-ms range
   *     .status     string | string[]  defaults to [STATUS_LIVE]
   *   opts.limit   default 10
   *   opts.offset  default 0
   *   opts.boost   per-term boost map { [term]: multiplier }
   *   opts.scorer  'bm25' (default) | 'tfidf'
   */
  query(q, opts) {
    opts = opts || {};
    const filters = opts.filters || {};
    const limit = typeof opts.limit === 'number' ? opts.limit : 10;
    const offset = typeof opts.offset === 'number' ? opts.offset : 0;
    const boost = opts.boost || {};
    const scorer = opts.scorer === 'tfidf' ? 'tfidf' : 'bm25';

    const terms = tokenize(String(q || ''));
    if (terms.length === 0) return [];

    const avgdl = this._avgDocLen();
    // docId → score
    const agg = new Map();
    // docId → Set<term> matched for highlighting
    const matchedTerms = new Map();

    for (let i = 0; i < terms.length; i++) {
      const term = terms[i];
      const byDoc = this._index.get(term);
      if (!byDoc) continue;
      for (const [docId, posting] of byDoc) {
        const meta = this._docMeta.get(docId);
        if (!meta || meta.status !== STATUS_LIVE) continue;
        const dl = this._docLen.get(docId) || 1;
        const baseScore = scorer === 'bm25'
          ? this._scoreBm25(term, posting, dl, avgdl)
          : this._scoreTfIdf(term, posting, dl);
        const boostMul = typeof boost[term] === 'number' ? boost[term] : 1;
        const delta = baseScore * boostMul;
        agg.set(docId, (agg.get(docId) || 0) + delta);
        let ms = matchedTerms.get(docId);
        if (!ms) { ms = new Set(); matchedTerms.set(docId, ms); }
        ms.add(term);
      }
    }

    // Flatten + filter + sort.
    const results = [];
    for (const [docId, score] of agg) {
      const meta = this._docMeta.get(docId);
      if (!this._passesFilters(meta, filters)) continue;
      results.push({
        docId,
        score,
        matched: Array.from(matchedTerms.get(docId) || []),
        metadata: meta.metadata,
        tags: meta.tags,
        docType: meta.docType,
        department: meta.department,
        versionId: meta.versionId,
        title_he: meta.titleHe,
        title_en: meta.titleEn,
      });
    }
    results.sort((a, b) => b.score - a.score || (a.docId < b.docId ? -1 : 1));
    return results.slice(offset, offset + limit);
  }

  _passesFilters(meta, filters) {
    if (!meta) return false;
    const wantStatus = this._asArr(filters.status) || [STATUS_LIVE];
    if (wantStatus.indexOf(meta.status) === -1) return false;
    if (filters.docType) {
      const dt = this._asArr(filters.docType);
      if (dt.indexOf(meta.docType) === -1) return false;
    }
    if (filters.department) {
      const dep = this._asArr(filters.department);
      if (dep.indexOf(meta.department) === -1) return false;
    }
    if (filters.tags) {
      const want = this._asArr(filters.tags);
      const have = meta.tags || [];
      const mode = filters.tagsMode === 'all' ? 'all' : 'any';
      if (mode === 'any') {
        let ok = false;
        for (let i = 0; i < want.length; i++) {
          if (have.indexOf(want[i]) !== -1) { ok = true; break; }
        }
        if (!ok) return false;
      } else {
        for (let i = 0; i < want.length; i++) {
          if (have.indexOf(want[i]) === -1) return false;
        }
      }
    }
    if (filters.dateRange) {
      const dr = filters.dateRange;
      if (dr.from != null && meta.createdAt < dr.from) return false;
      if (dr.to   != null && meta.createdAt > dr.to)   return false;
    }
    return true;
  }

  _asArr(v) {
    if (v == null) return null;
    return Array.isArray(v) ? v : [v];
  }

  // ─────────────────────────────────────────────────────────
  // Hebrew-specific query
  // ─────────────────────────────────────────────────────────

  /**
   * Hebrew-specific entry: accepts text with nikud and prefixes,
   * routes it through the normalisation pipeline, and preserves
   * the original opts contract for filters/limit/offset.
   */
  queryHebrew(q, opts) {
    const normalized = String(q || '').normalize('NFKC');
    return this.query(normalized, opts);
  }

  // ─────────────────────────────────────────────────────────
  // Phrase query — positional index
  // ─────────────────────────────────────────────────────────

  /**
   * Exact-phrase match using the positional index. All terms in
   * the phrase must occur at consecutive ordinal positions in
   * the same document.
   */
  phraseQuery(phrase, opts) {
    opts = opts || {};
    const filters = opts.filters || {};
    const limit = typeof opts.limit === 'number' ? opts.limit : 10;
    const offset = typeof opts.offset === 'number' ? opts.offset : 0;

    const terms = tokenize(String(phrase || ''));
    if (terms.length === 0) return [];

    // Intersect posting lists.
    let candidates = null;
    for (let i = 0; i < terms.length; i++) {
      const byDoc = this._index.get(terms[i]);
      if (!byDoc) return [];
      if (candidates === null) {
        candidates = new Set(byDoc.keys());
      } else {
        const next = new Set();
        for (const d of candidates) if (byDoc.has(d)) next.add(d);
        candidates = next;
      }
      if (candidates.size === 0) return [];
    }

    const out = [];
    for (const docId of candidates) {
      const meta = this._docMeta.get(docId);
      if (!meta || meta.status !== STATUS_LIVE) continue;
      if (!this._passesFilters(meta, filters)) continue;
      // Check for consecutive positions.
      const firstPos = this._index.get(terms[0]).get(docId).positions;
      let hit = false;
      outer: for (let i = 0; i < firstPos.length; i++) {
        const base = firstPos[i];
        for (let j = 1; j < terms.length; j++) {
          const posting = this._index.get(terms[j]).get(docId);
          if (posting.positions.indexOf(base + j) === -1) continue outer;
        }
        hit = true;
        break;
      }
      if (hit) {
        out.push({
          docId,
          score: terms.length, // crude: longer phrase = stronger hit
          matched: terms.slice(),
          metadata: meta.metadata,
          tags: meta.tags,
          docType: meta.docType,
          department: meta.department,
          versionId: meta.versionId,
          title_he: meta.titleHe,
          title_en: meta.titleEn,
        });
      }
    }
    out.sort((a, b) => b.score - a.score || (a.docId < b.docId ? -1 : 1));
    return out.slice(offset, offset + limit);
  }

  // ─────────────────────────────────────────────────────────
  // Fuzzy / suggestions
  // ─────────────────────────────────────────────────────────

  /**
   * Fuzzy search — for each query term, expand to all index
   * terms within Levenshtein distance ≤ maxDistance (default 2),
   * then union-score as a regular query.
   */
  fuzzySearch(q, opts) {
    opts = opts || {};
    const maxDistance = typeof opts.maxDistance === 'number' ? opts.maxDistance : 2;
    const terms = tokenize(String(q || ''));
    if (terms.length === 0) return [];
    // Expand.
    const expandedBoost = {};
    const expandedText = [];
    for (let i = 0; i < terms.length; i++) {
      const qt = terms[i];
      expandedText.push(qt);
      expandedBoost[qt] = 1.0;
      for (const term of this._index.keys()) {
        if (term === qt) continue;
        // Fast reject on length difference.
        if (Math.abs(term.length - qt.length) > maxDistance) continue;
        const d = levenshtein(term, qt);
        if (d <= maxDistance) {
          expandedText.push(term);
          // Diminish fuzzy hits by distance.
          expandedBoost[term] = 1 / (1 + d);
        }
      }
    }
    return this.query(expandedText.join(' '), {
      filters: opts.filters,
      limit: opts.limit,
      offset: opts.offset,
      boost: expandedBoost,
    });
  }

  /**
   * Spellcheck-style suggestions for a single term. Returns
   * up to `limit` index terms ordered by (distance asc, df desc).
   */
  suggestCorrections(term, opts) {
    opts = opts || {};
    const limit = typeof opts.limit === 'number' ? opts.limit : 5;
    const maxDistance = typeof opts.maxDistance === 'number' ? opts.maxDistance : 2;
    const t = normalizeToken(String(term || '').normalize('NFKC'));
    if (!t) return [];
    const candidates = [];
    for (const k of this._index.keys()) {
      if (k === t) continue;
      if (Math.abs(k.length - t.length) > maxDistance) continue;
      const d = levenshtein(k, t);
      if (d <= maxDistance) {
        candidates.push({ term: k, distance: d, df: this._index.get(k).size });
      }
    }
    candidates.sort((a, b) => a.distance - b.distance || b.df - a.df ||
      (a.term < b.term ? -1 : 1));
    return candidates.slice(0, limit);
  }

  // ─────────────────────────────────────────────────────────
  // Highlight
  // ─────────────────────────────────────────────────────────

  /**
   * Returns an HTML-safe snippet with matched terms wrapped in
   * `<mark>…</mark>` (configurable). The source is HTML-escaped
   * before wrapping, so arbitrary user content never injects.
   */
  highlight(content, query, opts) {
    opts = opts || {};
    const pre  = typeof opts.pre  === 'string' ? opts.pre  : '<mark>';
    const post = typeof opts.post === 'string' ? opts.post : '</mark>';
    const safe = escapeHtml(content);
    const terms = tokenize(String(query || ''));
    if (terms.length === 0) return safe;
    // Also highlight the ORIGINAL query tokens (pre-stem) so that
    // the wrapping is user-visible. We scan the raw source for
    // every raw token whose normalisation is in `terms`.
    const wantSet = new Set(terms);
    const rawContent = stripNikud(String(content || ''));
    const hits = [];
    const re = /[\u0590-\u05FF]+|[A-Za-z]+|[0-9]+/g;
    let m;
    while ((m = re.exec(rawContent)) !== null) {
      const norm = normalizeToken(m[0]);
      if (wantSet.has(norm)) {
        hits.push({ start: m.index, end: m.index + m[0].length });
      }
    }
    if (hits.length === 0) return safe;
    // Walk escaped output and re-derive offsets.
    // Simpler: rebuild from raw content with escaping + wrap per char.
    let out = '';
    let cursor = 0;
    const srcStr = String(content == null ? '' : content);
    // Because escapeHtml can shift character offsets, we scan the
    // RAW source but escape per chunk.
    for (let i = 0; i < hits.length; i++) {
      const h = hits[i];
      if (h.start < cursor) continue; // skip overlapping
      out += escapeHtml(srcStr.slice(cursor, h.start));
      out += pre;
      out += escapeHtml(srcStr.slice(h.start, h.end));
      out += post;
      cursor = h.end;
    }
    out += escapeHtml(srcStr.slice(cursor));
    return out;
  }

  // ─────────────────────────────────────────────────────────
  // Facets
  // ─────────────────────────────────────────────────────────

  /**
   * Counts per docType, tag and department across the current
   * query result set (or the full live index when q is empty).
   */
  facets(q, opts) {
    opts = opts || {};
    let docIds;
    if (q && String(q).length > 0) {
      const results = this.query(q, { limit: 1e9, filters: opts.filters });
      docIds = results.map((r) => r.docId);
    } else {
      docIds = [];
      for (const [docId, meta] of this._docMeta) {
        if (meta.status === STATUS_LIVE && this._passesFilters(meta, opts.filters || {})) {
          docIds.push(docId);
        }
      }
    }
    const docType = Object.create(null);
    const tag = Object.create(null);
    const department = Object.create(null);
    for (let i = 0; i < docIds.length; i++) {
      const meta = this._docMeta.get(docIds[i]);
      if (!meta) continue;
      if (meta.docType) docType[meta.docType] = (docType[meta.docType] || 0) + 1;
      if (meta.department) department[meta.department] = (department[meta.department] || 0) + 1;
      const tags = meta.tags || [];
      for (let j = 0; j < tags.length; j++) {
        tag[tags[j]] = (tag[tags[j]] || 0) + 1;
      }
    }
    return { docType, tag, department, total: docIds.length };
  }

  // ─────────────────────────────────────────────────────────
  // Autocomplete
  // ─────────────────────────────────────────────────────────

  /**
   * Returns up to `limit` index terms that start with `prefix`
   * after normalisation. Sorted by df desc, then lexical.
   */
  autocomplete(prefix, limit) {
    if (!isStr(prefix)) return [];
    const lim = typeof limit === 'number' ? limit : 10;
    const normalized = normalizeToken(stripNikud(prefix.normalize('NFKC')));
    if (!normalized) return [];
    const out = [];
    for (const term of this._index.keys()) {
      if (term.startsWith(normalized)) {
        out.push({ term, df: this._index.get(term).size });
      }
    }
    out.sort((a, b) => b.df - a.df || (a.term < b.term ? -1 : 1));
    return out.slice(0, lim).map((r) => r.term);
  }

  // ─────────────────────────────────────────────────────────
  // Reindex / stats
  // ─────────────────────────────────────────────────────────

  /**
   * Rebuild the live index from `_rawDocs`. Never touches raw
   * history. With `{fullHistory: true}` each historical version
   * is also replayed — the last version wins for live, older
   * versions land in the archive via the normal supersede path.
   */
  reindex(opts) {
    opts = opts || {};
    const fullHistory = !!opts.fullHistory;
    // Snapshot source.
    const source = new Map();
    for (const [docId, history] of this._rawDocs) {
      source.set(docId, history.slice());
    }
    // Capture which docs are currently archived (soft-unindexed)
    // so we don't resurrect them silently.
    const archived = new Set();
    for (const [docId, meta] of this._docMeta) {
      if (meta.status === STATUS_ARCHIVED) archived.add(docId);
    }
    // Reset live structures.
    this._index = new Map();
    this._docLen = new Map();
    this._docMeta = new Map();
    this._archive = new Map();
    this._totalLen = 0;
    this._N = 0;

    for (const [docId, history] of source) {
      if (history.length === 0) continue;
      if (fullHistory) {
        for (let i = 0; i < history.length; i++) {
          this.indexDocument(Object.assign({ docId }, history[i]));
        }
      } else {
        const last = history[history.length - 1];
        this.indexDocument(Object.assign({ docId }, last));
      }
      if (archived.has(docId)) {
        this.removeFromIndex(docId);
      }
    }
    this._logMutation('reindex', null, null, { fullHistory });
    return { N: this._N, terms: this._index.size };
  }

  stats() {
    let postings = 0;
    for (const byDoc of this._index.values()) postings += byDoc.size;
    let live = 0;
    let archivedCount = 0;
    let superseded = 0;
    for (const meta of this._docMeta.values()) {
      if (meta.status === STATUS_LIVE) live++;
      else if (meta.status === STATUS_ARCHIVED) archivedCount++;
      else if (meta.status === STATUS_SUPERSEDED) superseded++;
    }
    return {
      docCount: this._N,
      liveCount: live,
      archivedCount,
      supersededCount: superseded,
      termCount: this._index.size,
      postings,
      avgDocLen: this._avgDocLen(),
      mutationLogSize: this._mutationLog.length,
      rawDocsTracked: this._rawDocs.size,
    };
  }
}

// ════════════════════════════════════════════════════════════
// Exports
// ════════════════════════════════════════════════════════════

module.exports = {
  DocSearch,
  BM25_K1,
  BM25_B,
  STATUS_LIVE,
  STATUS_ARCHIVED,
  STATUS_SUPERSEDED,
  HEBREW_PREFIXES,
  HEBREW_SUFFIXES,
  HEBREW_STOPWORDS,
  ENGLISH_STOPWORDS,
  _internal: {
    tokenize,
    rawTokens,
    normalizeToken,
    normalizeTokens,
    hebrewVariants,
    stripNikud,
    stripHebrewPrefix,
    stripHebrewSuffix,
    stemEnglish,
    levenshtein,
    escapeHtml,
    escapeReg,
  },
};
