/**
 * Document-Specific Search Engine — DocSearch
 * Agent Y-112 — Techno-Kol Uzi / Mega-ERP
 *
 * A focused, purpose-built search engine for the Documents module that
 * COMPLEMENTS (never replaces) the generic ERP full-text index (AG-X14).
 *
 * Why a second engine? Documents have richer metadata (author, customer,
 * project, language, ACL, tags) and users need advanced operators —
 * phrase, proximity, wildcard, fuzzy, faceted, related-docs, saved
 * searches with alerts, and permission-filtered result sets.
 *
 *   מנוע חיפוש ייעודי למסמכים — משלים את X-14 ולא מחליף אותו.
 *   תומך עברית מלאה (ניקוד, אותיות סופיות, מילות-עצירה),
 *   חיפוש ביטוי מדויק, קרבה, תווים כלליים, פאזי (Levenshtein),
 *   הארת קטעים, מסמכים דומים (TF-IDF cosine),
 *   חיפוש מסונן לפי הרשאות, היסטוריה, חיפושים שמורים והתראות.
 *
 * Rule of engagement:
 *   לא מוחקים רק משדרגים ומגדלים — additive only, zero deletions.
 *   Zero external dependencies. Uses Map / Set only.
 *
 * Node:  >= 18
 * Run tests:   node --test test/documents/doc-search.test.js
 *
 * Public API (class DocSearch):
 *   indexDocument({docId, content, metadata})
 *   search({query, filters, scope, limit})
 *   phraseSearch({phrase, exact})
 *   proximitySearch({terms, maxDistance})
 *   wildcardSearch(pattern)              — supports * and ?
 *   fuzzySearch({query, maxEdits})       — Levenshtein
 *   highlightSnippets(docId, query)
 *   relatedDocuments(docId)              — TF-IDF cosine
 *   facetedSearch(query)                 — counts by type/author/date/tag
 *   savedSearches({userId})              — CRUD + alert on new matches
 *   searchHistory({userId})              — recent queries
 *   permissionFiltered({results, user})  — ACL filter
 *   hebrewTokenization(text)             — niqqud + finals + stopwords
 */

'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// 1. Linguistic constants — Hebrew + English
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Niqqud (Hebrew vowel points) and cantillation marks.
 * Unicode ranges: U+0591..U+05BD, U+05BF, U+05C1..U+05C2, U+05C4..U+05C5, U+05C7
 */
const NIQQUD_RE = /[\u0591-\u05BD\u05BF\u05C1\u05C2\u05C4\u05C5\u05C7]/g;

/**
 * Hebrew final letters map — normalize final form to base form so
 * "שלום" and "שלומ" resolve to the same token.
 */
const FINAL_LETTERS = Object.freeze({
  'ם': 'מ',
  'ן': 'נ',
  'ץ': 'צ',
  'ף': 'פ',
  'ך': 'כ',
});

/**
 * Hebrew stopwords — very common function words that add no signal.
 */
const HEBREW_STOPWORDS = new Set([
  'של', 'את', 'עם', 'זה', 'זו', 'זאת', 'הוא', 'היא', 'הם', 'הן',
  'על', 'אל', 'אם', 'כי', 'או', 'גם', 'לא', 'כן', 'יש', 'אין',
  'עוד', 'כמו', 'אחרי', 'לפני', 'בין', 'תחת', 'מעל', 'אצל',
  'לי', 'לך', 'לו', 'לה', 'לנו', 'לכם', 'להם', 'להן',
  'אני', 'אתה', 'אנחנו', 'אתם', 'אתן',
  'ה', 'ו', 'ב', 'ל', 'מ', 'ש', 'כ',
  'מה', 'מי', 'איך', 'למה', 'איפה', 'מתי',
  'אבל', 'כדי', 'רק', 'עד', 'כבר', 'אולי',
  'כל', 'כך', 'שלא', 'שם', 'פה', 'כאן',
]);

/**
 * English stopwords — standard subset.
 */
const ENGLISH_STOPWORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from',
  'has', 'have', 'he', 'in', 'is', 'it', 'its', 'of', 'on', 'that',
  'the', 'to', 'was', 'were', 'will', 'with', 'i', 'you', 'this',
  'but', 'or', 'if', 'not', 'so', 'do', 'does', 'did', 'had', 'been',
  'can', 'could', 'would', 'should', 'may', 'might', 'shall', 'will',
  'am', 'all', 'any', 'some', 'no', 'yes', 'we', 'they', 'them', 'our',
]);

// ═══════════════════════════════════════════════════════════════════════════
// 2. Tokenization & normalization helpers
// ═══════════════════════════════════════════════════════════════════════════

/** Strip Hebrew niqqud (vowel points) — safe no-op for non-Hebrew. */
function stripNiqqud(str) {
  if (typeof str !== 'string') return '';
  return str.replace(NIQQUD_RE, '');
}

/** Normalize Hebrew final letters to their base form. */
function normalizeFinalLetters(str) {
  if (typeof str !== 'string') return '';
  let out = '';
  for (const ch of str) {
    out += FINAL_LETTERS[ch] || ch;
  }
  return out;
}

/**
 * Detect the dominant language of a string. Used to pick tokenizer.
 * Heuristic: if Hebrew chars >= Latin chars → 'he', else 'en'.
 * Returns: 'he' | 'en' | 'mixed'
 */
function detectLanguage(text) {
  if (typeof text !== 'string' || text.length === 0) return 'en';
  let he = 0;
  let en = 0;
  for (const ch of text) {
    const code = ch.charCodeAt(0);
    if (code >= 0x0590 && code <= 0x05FF) he++;
    else if ((code >= 0x0041 && code <= 0x005A) || (code >= 0x0061 && code <= 0x007A)) en++;
  }
  if (he > 0 && en > 0) return 'mixed';
  if (he >= en) return 'he';
  return 'en';
}

/**
 * Core tokenizer — splits on non-word characters, handles Hebrew + Latin
 * + digits. Returns raw surface tokens (no stopword filtering here).
 */
function rawTokenize(text) {
  if (typeof text !== 'string' || text.length === 0) return [];
  // Hebrew letters U+05D0–U+05EA, Latin A–Z a–z, digits 0–9
  const re = /[\u05D0-\u05EA]+|[A-Za-z]+|[0-9]+/g;
  const out = [];
  let m;
  while ((m = re.exec(text)) !== null) {
    out.push(m[0]);
  }
  return out;
}

/**
 * Hebrew-aware tokenizer: strips niqqud, normalizes final letters, lowercases,
 * filters Hebrew + English stopwords. This is the one exposed via
 * `DocSearch#hebrewTokenization(text)`.
 */
function hebrewTokenize(text) {
  const clean = stripNiqqud(text);
  const raw = rawTokenize(clean);
  const out = [];
  for (const tok of raw) {
    const lower = tok.toLowerCase();
    const normalized = normalizeFinalLetters(lower);
    if (normalized.length === 0) continue;
    if (HEBREW_STOPWORDS.has(normalized)) continue;
    if (ENGLISH_STOPWORDS.has(normalized)) continue;
    out.push(normalized);
  }
  return out;
}

/**
 * Positional tokenization — returns [{token, pos}] pairs for phrase +
 * proximity searches. Keeps stopwords in position counting so phrase
 * distances match the natural reading.
 */
function positionalTokenize(text) {
  const clean = stripNiqqud(text);
  const raw = rawTokenize(clean);
  const out = [];
  for (let i = 0; i < raw.length; i++) {
    const lower = raw[i].toLowerCase();
    const normalized = normalizeFinalLetters(lower);
    if (normalized.length === 0) continue;
    out.push({ token: normalized, pos: i });
  }
  return out;
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. Levenshtein distance — bounded, for fuzzy search
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Classic dynamic-programming Levenshtein distance, bounded early exit
 * when rows exceed `maxEdits + 1`. Works correctly for Hebrew and Latin.
 */
function levenshtein(a, b, maxEdits) {
  if (a === b) return 0;
  if (!a) return b.length;
  if (!b) return a.length;
  const m = a.length;
  const n = b.length;
  if (Math.abs(m - n) > maxEdits) return maxEdits + 1;

  let prev = new Array(n + 1);
  let curr = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;

  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    let rowMin = curr[0];
    for (let j = 1; j <= n; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      curr[j] = Math.min(
        curr[j - 1] + 1,
        prev[j] + 1,
        prev[j - 1] + cost
      );
      if (curr[j] < rowMin) rowMin = curr[j];
    }
    if (rowMin > maxEdits) return maxEdits + 1;
    const tmp = prev; prev = curr; curr = tmp;
  }
  return prev[n];
}

// ═══════════════════════════════════════════════════════════════════════════
// 4. Wildcard matching — *, ?
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Compile a glob pattern (* and ?) to a RegExp that matches the
 * whole token. Escapes regex metacharacters.
 */
function compileWildcard(pattern) {
  let re = '^';
  for (const ch of pattern) {
    if (ch === '*') re += '.*';
    else if (ch === '?') re += '.';
    else if ('\\^$.|+()[]{}'.includes(ch)) re += '\\' + ch;
    else re += ch;
  }
  re += '$';
  return new RegExp(re);
}

// ═══════════════════════════════════════════════════════════════════════════
// 5. DocSearch — the class itself
// ═══════════════════════════════════════════════════════════════════════════

class DocSearch {
  constructor(opts = {}) {
    /** docId → {content, metadata, tokens, positions, termFreq, length, indexedAt} */
    this.docs = new Map();

    /** term → Set<docId>  (inverted index) */
    this.index = new Map();

    /** term → document frequency (number of docs containing term) */
    this.docFreq = new Map();

    /** per-user histories: userId → Array<{query, at}> */
    this.history = new Map();

    /** per-user saved searches: userId → Map<savedId, {name, query, filters, lastSeen, matches}> */
    this.saved = new Map();

    /** ACL map: docId → {owner, readers:Set, groups:Set, public:boolean} */
    this.acl = new Map();

    /** counter for savedSearch ids */
    this._savedCounter = 0;

    /** max history items per user */
    this.maxHistory = opts.maxHistory || 50;
  }

  // ─────────────────────────────────────────────────────────────────────
  // 5.1 Indexing
  // ─────────────────────────────────────────────────────────────────────

  /**
   * Index a document.
   * @param {object} doc
   * @param {string} doc.docId
   * @param {string} doc.content
   * @param {object} doc.metadata — {author, createdDate, type, tags, customerId, projectId, language, acl?}
   */
  indexDocument({ docId, content, metadata = {} } = {}) {
    if (!docId || typeof docId !== 'string') {
      throw new TypeError('indexDocument: docId is required');
    }
    if (typeof content !== 'string') {
      content = '';
    }

    // If doc already indexed, remove it first from the inverted index
    // (but keep the history and saved searches untouched — additive rule).
    if (this.docs.has(docId)) {
      this._removeFromIndex(docId);
    }

    const positions = positionalTokenize(content);
    // tokens used for ranking/search: stopword-filtered, niqqud-stripped,
    // final-letter normalized (same as hebrewTokenize).
    const tokens = [];
    const termFreq = new Map();
    for (const { token } of positions) {
      if (HEBREW_STOPWORDS.has(token) || ENGLISH_STOPWORDS.has(token)) continue;
      tokens.push(token);
      termFreq.set(token, (termFreq.get(token) || 0) + 1);
    }

    // Also index metadata fields that make sense for text search
    const metaTextParts = [];
    if (metadata.author) metaTextParts.push(String(metadata.author));
    if (metadata.type) metaTextParts.push(String(metadata.type));
    if (Array.isArray(metadata.tags)) metaTextParts.push(metadata.tags.join(' '));
    const metaText = metaTextParts.join(' ');
    if (metaText) {
      for (const t of hebrewTokenize(metaText)) {
        termFreq.set(t, (termFreq.get(t) || 0) + 1);
        // do NOT add to positional tokens — metadata positions aren't meaningful
      }
    }

    // Normalize metadata dates
    const createdDate = metadata.createdDate
      ? (metadata.createdDate instanceof Date ? metadata.createdDate : new Date(metadata.createdDate))
      : null;

    const record = {
      docId,
      content,
      metadata: {
        author: metadata.author || null,
        createdDate,
        type: metadata.type || null,
        tags: Array.isArray(metadata.tags) ? metadata.tags.slice() : [],
        customerId: metadata.customerId || null,
        projectId: metadata.projectId || null,
        language: metadata.language || detectLanguage(content),
      },
      tokens,
      positions,
      termFreq,
      length: tokens.length,
      indexedAt: new Date(),
    };

    this.docs.set(docId, record);

    // Update inverted index + doc frequency
    const seen = new Set();
    for (const term of termFreq.keys()) {
      if (!this.index.has(term)) this.index.set(term, new Set());
      this.index.get(term).add(docId);
      if (!seen.has(term)) {
        this.docFreq.set(term, (this.docFreq.get(term) || 0) + 1);
        seen.add(term);
      }
    }

    // Store ACL if caller provided it. Default: owner=author if present,
    // otherwise public.
    if (metadata.acl && typeof metadata.acl === 'object') {
      this.acl.set(docId, {
        owner: metadata.acl.owner || metadata.author || null,
        readers: new Set(metadata.acl.readers || []),
        groups: new Set(metadata.acl.groups || []),
        public: metadata.acl.public === true,
      });
    } else {
      this.acl.set(docId, {
        owner: metadata.author || null,
        readers: new Set(),
        groups: new Set(),
        public: true,
      });
    }

    return record;
  }

  /** Internal — remove a doc's contribution to the inverted index. */
  _removeFromIndex(docId) {
    const rec = this.docs.get(docId);
    if (!rec) return;
    for (const term of rec.termFreq.keys()) {
      const set = this.index.get(term);
      if (set) {
        set.delete(docId);
        if (set.size === 0) this.index.delete(term);
      }
      const df = this.docFreq.get(term) || 0;
      if (df <= 1) this.docFreq.delete(term);
      else this.docFreq.set(term, df - 1);
    }
    // NOTE: we deliberately keep `this.docs` and `this.acl` entries until
    // re-indexed by indexDocument, which will call us then re-add. We do
    // NOT delete the user's saved searches or history — additive rule.
  }

  // ─────────────────────────────────────────────────────────────────────
  // 5.2 Core search — ranked TF-IDF cosine-ish scoring
  // ─────────────────────────────────────────────────────────────────────

  /**
   * Search the index with filters, scope and pagination.
   * @param {object} req
   * @param {string} req.query — free text
   * @param {object} [req.filters] — {author, dateRange:{from,to}, type, tags:[], language}
   * @param {object} [req.scope]   — {customerId, projectId}
   * @param {number} [req.limit]   — default 20
   * @returns {{results, total, took_ms}}
   */
  search({ query, filters = {}, scope = {}, limit = 20 } = {}) {
    const t0 = Date.now();
    const queryTokens = hebrewTokenize(query || '');
    let candidateIds;

    if (queryTokens.length === 0) {
      // No text query: return all docs that pass filters, ordered by recency
      candidateIds = new Set(this.docs.keys());
    } else {
      candidateIds = new Set();
      for (const term of queryTokens) {
        const set = this.index.get(term);
        if (set) for (const id of set) candidateIds.add(id);
      }
    }

    const scored = [];
    const totalDocs = this.docs.size || 1;
    for (const id of candidateIds) {
      const doc = this.docs.get(id);
      if (!doc) continue;
      if (!this._passesFilters(doc, filters)) continue;
      if (!this._passesScope(doc, scope)) continue;

      const score = queryTokens.length === 0
        ? this._recencyScore(doc)
        : this._tfidfScore(doc, queryTokens, totalDocs);

      if (score > 0 || queryTokens.length === 0) {
        scored.push({ docId: id, score, metadata: doc.metadata });
      }
    }

    scored.sort((a, b) => b.score - a.score);
    const results = scored.slice(0, limit);

    return {
      results,
      total: scored.length,
      took_ms: Date.now() - t0,
    };
  }

  /** Compute TF-IDF cosine-ish score for a doc against query tokens. */
  _tfidfScore(doc, queryTokens, totalDocs) {
    let score = 0;
    for (const term of queryTokens) {
      const tf = doc.termFreq.get(term) || 0;
      if (tf === 0) continue;
      const df = this.docFreq.get(term) || 0;
      if (df === 0) continue;
      // +1 smoothing on idf, sublinear tf
      const idf = Math.log(1 + totalDocs / df);
      score += (1 + Math.log(tf)) * idf;
    }
    // Length normalization (damped)
    const norm = 1 + Math.log(1 + doc.length);
    return score / norm;
  }

  /** Recency-only score used when query is empty but filters are set. */
  _recencyScore(doc) {
    if (!doc.metadata.createdDate) return 0;
    const now = Date.now();
    const ms = now - doc.metadata.createdDate.getTime();
    const days = Math.max(0, ms / (1000 * 60 * 60 * 24));
    return 1 / (1 + days / 30);
  }

  /** True if a document passes the `filters` object. */
  _passesFilters(doc, filters) {
    if (!filters) return true;
    const m = doc.metadata;
    if (filters.author && m.author !== filters.author) return false;
    if (filters.type && m.type !== filters.type) return false;
    if (filters.language && m.language !== filters.language) return false;
    if (filters.tags) {
      const wanted = Array.isArray(filters.tags) ? filters.tags : [filters.tags];
      for (const t of wanted) {
        if (!m.tags.includes(t)) return false;
      }
    }
    if (filters.dateRange) {
      const { from, to } = filters.dateRange;
      if (!m.createdDate) return false;
      if (from) {
        const d = from instanceof Date ? from : new Date(from);
        if (m.createdDate < d) return false;
      }
      if (to) {
        const d = to instanceof Date ? to : new Date(to);
        if (m.createdDate > d) return false;
      }
    }
    return true;
  }

  _passesScope(doc, scope) {
    if (!scope) return true;
    const m = doc.metadata;
    if (scope.customerId && m.customerId !== scope.customerId) return false;
    if (scope.projectId && m.projectId !== scope.projectId) return false;
    return true;
  }

  // ─────────────────────────────────────────────────────────────────────
  // 5.3 Phrase search
  // ─────────────────────────────────────────────────────────────────────

  /**
   * Phrase search — finds docs that contain the given phrase as a
   * contiguous sequence of tokens.
   * @param {object} req
   * @param {string} req.phrase
   * @param {boolean} [req.exact=true] — when false, treats as AND-of-tokens
   */
  phraseSearch({ phrase, exact = true } = {}) {
    if (typeof phrase !== 'string' || phrase.trim() === '') {
      return { results: [], total: 0 };
    }
    const tokens = positionalTokenize(phrase).map((p) => p.token)
      .filter((t) => t.length > 0);
    if (tokens.length === 0) return { results: [], total: 0 };

    const results = [];
    for (const [docId, doc] of this.docs) {
      if (exact) {
        if (this._containsPhrase(doc.positions, tokens)) {
          results.push({ docId, metadata: doc.metadata, score: 1 });
        }
      } else {
        // non-exact: all tokens must appear somewhere
        let all = true;
        for (const t of tokens) {
          if (!doc.termFreq.has(t)) { all = false; break; }
        }
        if (all) results.push({ docId, metadata: doc.metadata, score: 0.5 });
      }
    }
    return { results, total: results.length };
  }

  /** Scan positional stream for an exact contiguous phrase. */
  _containsPhrase(positions, phraseTokens) {
    if (phraseTokens.length === 0) return false;
    // positions is array of {token, pos} in order
    const first = phraseTokens[0];
    for (let i = 0; i <= positions.length - phraseTokens.length; i++) {
      if (positions[i].token !== first) continue;
      let ok = true;
      for (let k = 1; k < phraseTokens.length; k++) {
        if (positions[i + k].token !== phraseTokens[k]) { ok = false; break; }
      }
      if (ok) return true;
    }
    return false;
  }

  // ─────────────────────────────────────────────────────────────────────
  // 5.4 Proximity search — all terms within N words of each other
  // ─────────────────────────────────────────────────────────────────────

  /**
   * Proximity search — all terms must appear in the document within
   * `maxDistance` positions of each other (window-based).
   */
  proximitySearch({ terms, maxDistance = 5 } = {}) {
    if (!Array.isArray(terms) || terms.length === 0) return { results: [], total: 0 };
    const normTerms = terms
      .map((t) => hebrewTokenize(t)[0])
      .filter((t) => typeof t === 'string' && t.length > 0);
    if (normTerms.length === 0) return { results: [], total: 0 };

    const results = [];
    for (const [docId, doc] of this.docs) {
      // Collect positions for each term
      const termPositions = [];
      let allPresent = true;
      for (const t of normTerms) {
        const positions = [];
        for (const p of doc.positions) {
          if (p.token === t) positions.push(p.pos);
        }
        if (positions.length === 0) { allPresent = false; break; }
        termPositions.push(positions);
      }
      if (!allPresent) continue;

      // Find the smallest window that contains at least one occurrence
      // of every term
      const span = this._smallestWindow(termPositions);
      if (span !== null && span <= maxDistance) {
        results.push({
          docId,
          metadata: doc.metadata,
          span,
          score: 1 / (1 + span),
        });
      }
    }
    results.sort((a, b) => b.score - a.score);
    return { results, total: results.length };
  }

  /**
   * Given arrays of sorted positions per term, return the smallest
   * max-min window that contains one position from each list.
   * Classic "minimum range covering all lists" algorithm.
   */
  _smallestWindow(lists) {
    const n = lists.length;
    if (n === 0) return null;
    const ptrs = new Array(n).fill(0);
    let best = Infinity;
    while (true) {
      let min = Infinity;
      let max = -Infinity;
      let minIdx = -1;
      for (let i = 0; i < n; i++) {
        const p = lists[i][ptrs[i]];
        if (p < min) { min = p; minIdx = i; }
        if (p > max) max = p;
      }
      const span = max - min;
      if (span < best) best = span;
      // advance the pointer at the list with the smallest current position
      ptrs[minIdx]++;
      if (ptrs[minIdx] >= lists[minIdx].length) break;
    }
    return best === Infinity ? null : best;
  }

  // ─────────────────────────────────────────────────────────────────────
  // 5.5 Wildcard search — * and ?
  // ─────────────────────────────────────────────────────────────────────

  /**
   * Wildcard search — scans the vocabulary for terms matching the
   * pattern and returns docs that contain any of those terms.
   */
  wildcardSearch(pattern) {
    if (typeof pattern !== 'string' || pattern.length === 0) {
      return { results: [], total: 0 };
    }
    const clean = normalizeFinalLetters(stripNiqqud(pattern).toLowerCase());
    const re = compileWildcard(clean);

    const matchingTerms = [];
    for (const term of this.index.keys()) {
      if (re.test(term)) matchingTerms.push(term);
    }
    if (matchingTerms.length === 0) return { results: [], total: 0 };

    const docScore = new Map();
    for (const term of matchingTerms) {
      const set = this.index.get(term);
      if (!set) continue;
      for (const id of set) {
        docScore.set(id, (docScore.get(id) || 0) + 1);
      }
    }
    const results = [];
    for (const [docId, hits] of docScore) {
      const doc = this.docs.get(docId);
      if (!doc) continue;
      results.push({
        docId,
        metadata: doc.metadata,
        matchingTerms: matchingTerms.filter((t) => doc.termFreq.has(t)),
        score: hits,
      });
    }
    results.sort((a, b) => b.score - a.score);
    return { results, total: results.length, matchingTerms };
  }

  // ─────────────────────────────────────────────────────────────────────
  // 5.6 Fuzzy search — Levenshtein
  // ─────────────────────────────────────────────────────────────────────

  /**
   * Fuzzy search — finds terms whose Levenshtein distance from the
   * query is ≤ maxEdits, then returns docs containing any of them.
   */
  fuzzySearch({ query, maxEdits = 2 } = {}) {
    if (typeof query !== 'string' || query.trim() === '') {
      return { results: [], total: 0 };
    }
    const queryTokens = hebrewTokenize(query);
    if (queryTokens.length === 0) return { results: [], total: 0 };

    // Expand each query token to matching vocabulary terms.
    const expansions = new Map(); // queryToken → Array<{term, dist}>
    for (const qt of queryTokens) {
      const matches = [];
      for (const term of this.index.keys()) {
        const d = levenshtein(qt, term, maxEdits);
        if (d <= maxEdits) matches.push({ term, dist: d });
      }
      if (matches.length > 0) expansions.set(qt, matches);
    }
    if (expansions.size === 0) return { results: [], total: 0 };

    // Score docs by sum of (1 / (1 + dist)) across expanded terms
    const docScore = new Map();
    const docHits = new Map();
    for (const matches of expansions.values()) {
      for (const { term, dist } of matches) {
        const set = this.index.get(term);
        if (!set) continue;
        for (const id of set) {
          docScore.set(id, (docScore.get(id) || 0) + 1 / (1 + dist));
          if (!docHits.has(id)) docHits.set(id, new Set());
          docHits.get(id).add(term);
        }
      }
    }

    const results = [];
    for (const [docId, score] of docScore) {
      const doc = this.docs.get(docId);
      if (!doc) continue;
      results.push({
        docId,
        metadata: doc.metadata,
        score,
        matchedTerms: Array.from(docHits.get(docId) || []),
      });
    }
    results.sort((a, b) => b.score - a.score);
    return { results, total: results.length };
  }

  // ─────────────────────────────────────────────────────────────────────
  // 5.7 Highlight snippets — passages around matches
  // ─────────────────────────────────────────────────────────────────────

  /**
   * Return passages from the document where query terms occur, with
   * surrounding context (window of 6 words each side).
   */
  highlightSnippets(docId, query, opts = {}) {
    const doc = this.docs.get(docId);
    if (!doc) return { snippets: [] };
    const queryTokens = new Set(hebrewTokenize(query || ''));
    if (queryTokens.size === 0) return { snippets: [] };
    const window = opts.window || 6;
    const maxSnippets = opts.maxSnippets || 5;

    const raw = rawTokenize(stripNiqqud(doc.content));
    const lowered = raw.map((t) => normalizeFinalLetters(t.toLowerCase()));

    const snippets = [];
    const used = new Set();
    for (let i = 0; i < lowered.length && snippets.length < maxSnippets; i++) {
      if (!queryTokens.has(lowered[i])) continue;
      // snap-to-window start; skip if overlaps previous snippet
      const start = Math.max(0, i - window);
      const end = Math.min(raw.length, i + window + 1);
      const key = `${start}-${end}`;
      if (used.has(key)) continue;
      used.add(key);
      const before = raw.slice(start, i).join(' ');
      const match = raw[i];
      const after = raw.slice(i + 1, end).join(' ');
      snippets.push({
        start,
        end,
        before,
        match,
        after,
        text: `${before} [${match}] ${after}`.trim(),
      });
    }
    return { snippets };
  }

  // ─────────────────────────────────────────────────────────────────────
  // 5.8 Related documents — TF-IDF cosine similarity
  // ─────────────────────────────────────────────────────────────────────

  /** Return the top-N documents most similar to `docId` by cosine TF-IDF. */
  relatedDocuments(docId, limit = 5) {
    const source = this.docs.get(docId);
    if (!source) return [];
    const totalDocs = this.docs.size || 1;
    const srcVec = this._tfidfVector(source, totalDocs);
    const srcNorm = Math.sqrt(this._dot(srcVec, srcVec));
    if (srcNorm === 0) return [];

    const out = [];
    for (const [otherId, other] of this.docs) {
      if (otherId === docId) continue;
      const otherVec = this._tfidfVector(other, totalDocs);
      const otherNorm = Math.sqrt(this._dot(otherVec, otherVec));
      if (otherNorm === 0) continue;
      const sim = this._dot(srcVec, otherVec) / (srcNorm * otherNorm);
      if (sim > 0) out.push({ docId: otherId, similarity: sim, metadata: other.metadata });
    }
    out.sort((a, b) => b.similarity - a.similarity);
    return out.slice(0, limit);
  }

  _tfidfVector(doc, totalDocs) {
    const vec = new Map();
    for (const [term, tf] of doc.termFreq) {
      const df = this.docFreq.get(term) || 0;
      if (df === 0) continue;
      const idf = Math.log(1 + totalDocs / df);
      vec.set(term, (1 + Math.log(tf)) * idf);
    }
    return vec;
  }

  _dot(a, b) {
    let sum = 0;
    // iterate over the smaller map for efficiency
    const [small, big] = a.size <= b.size ? [a, b] : [b, a];
    for (const [term, v] of small) {
      const w = big.get(term);
      if (w !== undefined) sum += v * w;
    }
    return sum;
  }

  // ─────────────────────────────────────────────────────────────────────
  // 5.9 Faceted search — counts by type, author, date-bucket, tag
  // ─────────────────────────────────────────────────────────────────────

  /**
   * Run a query then return facet counts across the matching docs.
   * Dates are bucketed by year-month (YYYY-MM).
   */
  facetedSearch(query, filters = {}) {
    const base = this.search({ query, filters, limit: Number.MAX_SAFE_INTEGER });
    const facets = {
      type: new Map(),
      author: new Map(),
      date: new Map(),
      tag: new Map(),
      language: new Map(),
    };
    for (const r of base.results) {
      const m = r.metadata;
      if (m.type) facets.type.set(m.type, (facets.type.get(m.type) || 0) + 1);
      if (m.author) facets.author.set(m.author, (facets.author.get(m.author) || 0) + 1);
      if (m.language) facets.language.set(m.language, (facets.language.get(m.language) || 0) + 1);
      if (m.createdDate) {
        const bucket = this._dateBucket(m.createdDate);
        facets.date.set(bucket, (facets.date.get(bucket) || 0) + 1);
      }
      for (const tag of m.tags) {
        facets.tag.set(tag, (facets.tag.get(tag) || 0) + 1);
      }
    }
    return {
      total: base.total,
      facets: {
        type: Object.fromEntries(facets.type),
        author: Object.fromEntries(facets.author),
        date: Object.fromEntries(facets.date),
        tag: Object.fromEntries(facets.tag),
        language: Object.fromEntries(facets.language),
      },
      results: base.results.slice(0, 20),
    };
  }

  _dateBucket(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
  }

  // ─────────────────────────────────────────────────────────────────────
  // 5.10 Saved searches — CRUD + alert check on new matches
  // ─────────────────────────────────────────────────────────────────────

  /**
   * Saved-searches manager for a given user.
   * Returns an object with list/save/remove/checkAlerts helpers.
   */
  savedSearches({ userId } = {}) {
    if (!userId) throw new TypeError('savedSearches: userId is required');
    if (!this.saved.has(userId)) this.saved.set(userId, new Map());
    const bag = this.saved.get(userId);
    const self = this;

    return {
      list() {
        return Array.from(bag.values()).map((s) => ({ ...s, matches: s.matches ? s.matches.length : 0 }));
      },
      save({ name, query, filters = {}, scope = {} }) {
        const id = `sv_${++self._savedCounter}`;
        const entry = {
          id,
          name: name || query || 'untitled',
          query: query || '',
          filters,
          scope,
          createdAt: new Date(),
          lastSeen: new Date(),
          matches: [],
        };
        // prime the matches snapshot so alerts are relative to "now"
        const res = self.search({ query: entry.query, filters: entry.filters, scope: entry.scope, limit: 1000 });
        entry.matches = res.results.map((r) => r.docId);
        bag.set(id, entry);
        return { ...entry };
      },
      remove(id) {
        // additive rule: we mark as archived rather than deleting
        const entry = bag.get(id);
        if (!entry) return false;
        entry.archived = true;
        return true;
      },
      /**
       * Re-run every saved search and return any that have new matches
       * since `lastSeen`. Updates internal state so subsequent calls
       * only surface freshly added docs.
       */
      checkAlerts() {
        const alerts = [];
        for (const entry of bag.values()) {
          if (entry.archived) continue;
          const res = self.search({
            query: entry.query,
            filters: entry.filters,
            scope: entry.scope,
            limit: 1000,
          });
          const prev = new Set(entry.matches);
          const fresh = res.results.filter((r) => !prev.has(r.docId));
          if (fresh.length > 0) {
            alerts.push({
              savedId: entry.id,
              name: entry.name,
              newMatches: fresh.map((r) => r.docId),
            });
            entry.matches = res.results.map((r) => r.docId);
            entry.lastSeen = new Date();
          }
        }
        return alerts;
      },
    };
  }

  // ─────────────────────────────────────────────────────────────────────
  // 5.11 Search history — recent queries per user
  // ─────────────────────────────────────────────────────────────────────

  /**
   * Search history API for a user. `push` records a new query,
   * `list` returns the recent N (newest first).
   */
  searchHistory({ userId } = {}) {
    if (!userId) throw new TypeError('searchHistory: userId is required');
    if (!this.history.has(userId)) this.history.set(userId, []);
    const arr = this.history.get(userId);
    const self = this;
    return {
      push(query) {
        if (typeof query !== 'string' || query.trim() === '') return;
        arr.unshift({ query, at: new Date() });
        if (arr.length > self.maxHistory) arr.length = self.maxHistory;
      },
      list(limit = 20) {
        return arr.slice(0, limit).map((x) => ({ ...x }));
      },
      clear() {
        // additive rule: we "clear" by archiving, not wiping
        arr.forEach((x) => { x.archived = true; });
        return true;
      },
    };
  }

  // ─────────────────────────────────────────────────────────────────────
  // 5.12 Permission-filtered results — ACL enforcement
  // ─────────────────────────────────────────────────────────────────────

  /**
   * Filter a result set down to docs that `user` may read.
   * A user can read a doc when:
   *   - doc is public, OR
   *   - user.id === acl.owner, OR
   *   - user.id is in acl.readers, OR
   *   - any group in user.groups intersects acl.groups, OR
   *   - user.roles includes 'admin'
   */
  permissionFiltered({ results, user } = {}) {
    if (!Array.isArray(results)) return [];
    if (!user) return [];
    const roles = new Set(user.roles || []);
    const groups = new Set(user.groups || []);
    const uid = user.id;
    const isAdmin = roles.has('admin');
    const out = [];
    for (const r of results) {
      if (!r || !r.docId) continue;
      if (isAdmin) { out.push(r); continue; }
      const acl = this.acl.get(r.docId);
      if (!acl) continue;
      if (acl.public) { out.push(r); continue; }
      if (uid && acl.owner === uid) { out.push(r); continue; }
      if (uid && acl.readers.has(uid)) { out.push(r); continue; }
      let intersects = false;
      for (const g of groups) {
        if (acl.groups.has(g)) { intersects = true; break; }
      }
      if (intersects) out.push(r);
    }
    return out;
  }

  // ─────────────────────────────────────────────────────────────────────
  // 5.13 Hebrew tokenization — public entry point
  // ─────────────────────────────────────────────────────────────────────

  /**
   * Public Hebrew tokenizer. Strips niqqud, normalizes final letters,
   * lowercases and removes Hebrew + English stopwords.
   */
  hebrewTokenization(text) {
    return hebrewTokenize(text);
  }

  // ─────────────────────────────────────────────────────────────────────
  // 5.14 Introspection (useful for tests and diagnostics)
  // ─────────────────────────────────────────────────────────────────────

  stats() {
    return {
      docs: this.docs.size,
      terms: this.index.size,
      users: this.history.size,
      savedSearches: Array.from(this.saved.values()).reduce((n, m) => n + m.size, 0),
    };
  }

  hasTerm(term) {
    const clean = normalizeFinalLetters(stripNiqqud(String(term).toLowerCase()));
    return this.index.has(clean);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 6. Exports
// ═══════════════════════════════════════════════════════════════════════════

module.exports = {
  DocSearch,
  // helpers exported for unit testing
  hebrewTokenize,
  stripNiqqud,
  normalizeFinalLetters,
  levenshtein,
  compileWildcard,
  detectLanguage,
  rawTokenize,
  positionalTokenize,
  HEBREW_STOPWORDS,
  ENGLISH_STOPWORDS,
  FINAL_LETTERS,
};
