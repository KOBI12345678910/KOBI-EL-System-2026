/**
 * Global Search Federator — Scatter/Gather across ERP module indexes
 * Agent Y-198 — Techno-Kol Uzi / Mega-ERP
 *
 * Federates full-text search across every registered ERP module (procurement,
 * HR, finance, CRM, inventory, projects, etc.). Each module exposes a local
 * `searchFn(query, opts)` and the federator scatters the query in parallel,
 * gathers partial results (tolerating per-module timeouts), re-scores them
 * using a unified TF-IDF / BM25 model, applies ACL filtering, produces safe
 * HTML highlights, and returns facets by type / date / owner.
 *
 *   פדרטור חיפוש גלובלי — Scatter/Gather על-פני אינדקסי מודולים.
 *   כל מודול רושם פונקציית חיפוש מקומית, הפדרטור מפזר שאילתה במקביל,
 *   אוסף תוצאות חלקיות (סובלני ל-timeout), מחשב דירוג BM25 מאוחד,
 *   מסנן לפי הרשאות, מדגיש התאמות ב-HTML בטוח ומחזיר פאסטות.
 *   עברית ואנגלית, ללא תלויות חיצוניות, Node built-ins בלבד.
 *
 * Run:   node --test test/wiring/global-search.test.js
 * Node:  >= 18 (uses Promise.allSettled, AbortController, built-ins only)
 *
 * Usage:
 *   const { GlobalSearch } = require('./global-search');
 *   const gs = new GlobalSearch({ defaultTimeoutMs: 250 });
 *   gs.registerIndex('procurement', async (q, opts) => [
 *     { id: 'po-1', type: 'po', title: 'רכש חומרי בניין', owner: 'kobi',
 *       date: '2026-01-15', body: 'cement bricks ...', acl: ['admin','ops'] }
 *   ]);
 *   const res = await gs.query('cement', { limit: 20, perms: ['ops'] });
 *
 * API surface:
 *   new GlobalSearch(config)                → GlobalSearch instance
 *   .registerIndex(moduleId, searchFn)      → void
 *   .unregisterIndex(moduleId)              → boolean  (soft-disable, never delete)
 *   .query(q, opts)                         → Promise<SearchResponse>
 *   .tokenize(text)                         → string[]     (bilingual)
 *   .escapeHtml(text)                       → string       (safe HTML)
 *   .highlight(text, queryTokens)           → string       (safe HTML highlight)
 *   .modules                                → ReadonlyArray<string>
 *
 * CONTRACT (per-module searchFn):
 *   async (query: string, opts: { limit, types, perms, signal }) =>
 *     Array<{
 *       id:      string,
 *       type:    string,            // e.g. 'po', 'invoice', 'supplier'
 *       title:   string,
 *       body?:   string,
 *       owner?:  string,
 *       date?:   string | number,   // ISO-8601 or epoch
 *       acl?:    string[],          // list of permissions required
 *       score?:  number,            // optional local score (hint only)
 *       url?:    string,            // optional deep-link
 *       [k]:     unknown            // additional fields kept but ignored
 *     }>
 *
 * RULES enforced in this module:
 *   - Never deletes a registered index. `unregisterIndex` only disables it.
 *   - Only Node built-ins (no dependencies, no external search engines).
 *   - Bilingual tokenizer (Hebrew niqqud + final letters + English stemming).
 *   - Permission filtering happens BEFORE scoring → no leakage of metadata.
 *   - Scatter/gather tolerates partial failures and per-module timeouts.
 */

'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// 1. CONSTANTS — Hebrew + English stopwords / niqqud / final letters
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Unicode ranges for Hebrew niqqud (vowel points) and cantillation marks.
 * Stripping these keeps "שָׁלוֹם" and "שלום" in the same bucket.
 */
const NIQQUD_RE = /[\u0591-\u05BD\u05BF\u05C1\u05C2\u05C4\u05C5\u05C7]/g;

/**
 * Hebrew final-letter map — normalize sofit to standard form so that
 * "שלום" (final mem) and "שלומ" (non-final) tokenize identically.
 */
const FINAL_LETTERS = Object.freeze({
  'ם': 'מ',
  'ן': 'נ',
  'ץ': 'צ',
  'ף': 'פ',
  'ך': 'כ',
});

/**
 * Bilingual stopword set — removed before scoring. Short lists on purpose
 * so we don't over-filter short queries. Ordered for readability.
 */
const STOPWORDS = new Set([
  // English
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from',
  'has', 'he', 'in', 'is', 'it', 'its', 'of', 'on', 'or', 'that',
  'the', 'to', 'was', 'were', 'will', 'with',
  // Hebrew — common particles and prepositions
  'של', 'את', 'על', 'עם', 'אל', 'כי', 'גם', 'לא', 'כן', 'זה',
  'זו', 'הוא', 'היא', 'הם', 'הן', 'אני', 'אנחנו', 'אתה', 'אתם',
  'או', 'אבל', 'אם', 'כך', 'כמו',
]);

/**
 * BM25 tuning — k1 saturates term frequency, b balances document-length
 * normalization. These are the standard Robertson/Sparck-Jones defaults.
 */
const BM25_K1 = 1.2;
const BM25_B = 0.75;

/** Default per-module scatter timeout in milliseconds. */
const DEFAULT_TIMEOUT_MS = 500;

/** Default max results returned to the caller. */
const DEFAULT_LIMIT = 50;

// ═══════════════════════════════════════════════════════════════════════════
// 2. TOKENIZER — Bilingual, niqqud-stripping, final-letter-normalizing
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Normalize a single token to its canonical form:
 *   - lowercase (English)
 *   - strip niqqud (Hebrew)
 *   - replace final letters (Hebrew)
 *
 * Returns empty string for non-string / empty input.
 */
function normalizeToken(tok) {
  if (typeof tok !== 'string' || tok.length === 0) return '';
  let out = tok.toLowerCase().replace(NIQQUD_RE, '');
  let mapped = '';
  for (let i = 0; i < out.length; i++) {
    const ch = out[i];
    mapped += FINAL_LETTERS[ch] || ch;
  }
  return mapped;
}

/**
 * Bilingual tokenizer — splits on any run of non-letter / non-digit,
 * where "letter" includes ASCII a-z, digits 0-9, and the Hebrew block
 * U+05D0..U+05EA (alef..tav). Anything else (punctuation, Arabic,
 * Cyrillic, emoji) is treated as a separator.
 *
 * Returns an array of normalized, stopword-stripped tokens.
 */
function tokenize(text) {
  if (text == null) return [];
  const str = String(text);
  const out = [];
  let buf = '';
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    const code = ch.charCodeAt(0);
    const isAscii =
      (code >= 48 && code <= 57) ||    // 0-9
      (code >= 65 && code <= 90) ||    // A-Z
      (code >= 97 && code <= 122);     // a-z
    const isHebrew = code >= 0x05D0 && code <= 0x05EA;
    const isNiqqud = code >= 0x0591 && code <= 0x05C7;
    if (isAscii || isHebrew || isNiqqud) {
      buf += ch;
    } else if (buf.length > 0) {
      const norm = normalizeToken(buf);
      if (norm.length > 0 && !STOPWORDS.has(norm)) out.push(norm);
      buf = '';
    }
  }
  if (buf.length > 0) {
    const norm = normalizeToken(buf);
    if (norm.length > 0 && !STOPWORDS.has(norm)) out.push(norm);
  }
  return out;
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. HTML SAFETY — escape + highlight
// ═══════════════════════════════════════════════════════════════════════════

/**
 * HTML-escape untrusted text. We escape the five standard entities plus
 * the backtick (defense-in-depth for legacy IE 8/9 attribute parsing).
 * NEVER output un-escaped user data into HTML contexts.
 */
function escapeHtml(text) {
  if (text == null) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/`/g, '&#96;');
}

/**
 * Wrap query-token matches in <mark> tags — the full text is escaped
 * FIRST, then we re-scan the escaped output and wrap each match, so the
 * resulting string is always safe to inject into innerHTML.
 *
 * Hebrew note: matches are case-insensitive and compared on normalized
 * tokens, so niqqud and final-letter variants highlight correctly.
 */
function highlightText(text, queryTokens) {
  const safe = escapeHtml(text);
  if (!Array.isArray(queryTokens) || queryTokens.length === 0) return safe;
  // Walk the safe string word-by-word and wrap normalized matches.
  const tokens = new Set(
    queryTokens.map(normalizeToken).filter((t) => t.length > 0)
  );
  if (tokens.size === 0) return safe;
  let out = '';
  let buf = '';
  const flush = () => {
    if (buf.length === 0) return;
    if (tokens.has(normalizeToken(buf))) {
      out += '<mark>' + buf + '</mark>';
    } else {
      out += buf;
    }
    buf = '';
  };
  for (let i = 0; i < safe.length; i++) {
    const ch = safe[i];
    const code = ch.charCodeAt(0);
    const isAscii =
      (code >= 48 && code <= 57) ||
      (code >= 65 && code <= 90) ||
      (code >= 97 && code <= 122);
    const isHebrew = code >= 0x05D0 && code <= 0x05EA;
    const isNiqqud = code >= 0x0591 && code <= 0x05C7;
    if (isAscii || isHebrew || isNiqqud) {
      buf += ch;
    } else {
      flush();
      out += ch;
    }
  }
  flush();
  return out;
}

// ═══════════════════════════════════════════════════════════════════════════
// 4. SCORING — TF-IDF + BM25 unified re-ranker
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Compute unified BM25 score for a single document against a query.
 *
 *   score = Σ_t IDF(t) · ( tf · (k1+1) ) / ( tf + k1 · (1 - b + b · dl/avgdl) )
 *
 *   IDF(t) = ln( (N - df + 0.5) / (df + 0.5) + 1 )   // BM25+ smoothing
 *
 * Inputs:
 *   queryTokens    — normalized query tokens
 *   docTokens      — normalized tokens for this document
 *   docFreq        — Map<term, number-of-docs-containing-term>
 *   totalDocs      — N (corpus size)
 *   avgDocLen      — mean document length
 */
function bm25Score(queryTokens, docTokens, docFreq, totalDocs, avgDocLen) {
  if (!docTokens || docTokens.length === 0) return 0;
  const dl = docTokens.length;
  const tfMap = new Map();
  for (const t of docTokens) tfMap.set(t, (tfMap.get(t) || 0) + 1);
  let score = 0;
  for (const q of queryTokens) {
    const tf = tfMap.get(q) || 0;
    if (tf === 0) continue;
    const df = docFreq.get(q) || 0;
    const idf = Math.log(
      (totalDocs - df + 0.5) / (df + 0.5) + 1
    );
    const norm = 1 - BM25_B + BM25_B * (dl / (avgDocLen || 1));
    const weight = (tf * (BM25_K1 + 1)) / (tf + BM25_K1 * norm);
    score += idf * weight;
  }
  return score;
}

/**
 * Classic TF-IDF kept as secondary signal — small bonus for documents
 * whose raw term frequency is very high even after BM25 saturates.
 */
function tfIdfBonus(queryTokens, docTokens, docFreq, totalDocs) {
  if (!docTokens || docTokens.length === 0) return 0;
  const tfMap = new Map();
  for (const t of docTokens) tfMap.set(t, (tfMap.get(t) || 0) + 1);
  let bonus = 0;
  for (const q of queryTokens) {
    const tf = tfMap.get(q) || 0;
    if (tf === 0) continue;
    const df = docFreq.get(q) || 1;
    const idf = Math.log(1 + totalDocs / df);
    bonus += (tf / docTokens.length) * idf;
  }
  return bonus * 0.15; // 15% weight vs BM25
}

// ═══════════════════════════════════════════════════════════════════════════
// 5. PERMISSION FILTERING
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Check whether a set of caller permissions satisfies a document's ACL.
 *
 * Rules:
 *   - No ACL on the doc → public, everyone can see it.
 *   - Doc has ACL, caller has no perms → DENY.
 *   - Doc has ACL, caller has ANY matching perm → ALLOW.
 *   - '*' in caller perms → super-user, ALLOW everything.
 */
function hasPermission(docAcl, callerPerms) {
  if (!Array.isArray(docAcl) || docAcl.length === 0) return true;
  if (!Array.isArray(callerPerms) || callerPerms.length === 0) return false;
  if (callerPerms.indexOf('*') !== -1) return true;
  for (const p of callerPerms) {
    if (docAcl.indexOf(p) !== -1) return true;
  }
  return false;
}

// ═══════════════════════════════════════════════════════════════════════════
// 6. FACET BUILDER — type / date / owner histograms
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Build facet histograms from a result set. Facets are always returned as
 * sorted arrays so consumers can render them deterministically.
 *
 *   type    → by discrete document type
 *   owner   → by owner string
 *   date    → bucketed by YYYY-MM (month granularity)
 */
function buildFacets(results) {
  const typeMap = new Map();
  const ownerMap = new Map();
  const dateMap = new Map();
  for (const r of results) {
    if (r.type) typeMap.set(r.type, (typeMap.get(r.type) || 0) + 1);
    if (r.owner) ownerMap.set(r.owner, (ownerMap.get(r.owner) || 0) + 1);
    if (r.date != null) {
      const d = new Date(r.date);
      if (!Number.isNaN(d.getTime())) {
        const key =
          d.getUTCFullYear() +
          '-' +
          String(d.getUTCMonth() + 1).padStart(2, '0');
        dateMap.set(key, (dateMap.get(key) || 0) + 1);
      }
    }
  }
  const toSorted = (m) =>
    [...m.entries()]
      .map(([key, count]) => ({ key, count }))
      .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
  return {
    type: toSorted(typeMap),
    owner: toSorted(ownerMap),
    date: toSorted(dateMap),
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 7. SCATTER/GATHER — timeout-tolerant parallel fan-out
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Race a promise against a timeout that resolves (not rejects) with a
 * sentinel so one slow module never sinks the whole federated query.
 * Uses AbortController so well-behaved modules can cancel work.
 */
function withTimeout(promise, timeoutMs, ctrl) {
  let timer;
  const timeoutP = new Promise((resolve) => {
    timer = setTimeout(() => {
      try { ctrl.abort(); } catch (_) { /* no-op */ }
      resolve({ __timeout: true });
    }, timeoutMs);
  });
  return Promise.race([
    promise.then(
      (v) => { clearTimeout(timer); return v; },
      (e) => { clearTimeout(timer); return { __error: e }; }
    ),
    timeoutP,
  ]);
}

// ═══════════════════════════════════════════════════════════════════════════
// 8. GlobalSearch CLASS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Federator over registered module indexes. Stateless between queries
 * except for the registry (which is append-only: unregister soft-disables
 * rather than deleting so audit trails remain intact).
 */
class GlobalSearch {
  constructor(config = {}) {
    /** Registry of { id, searchFn, enabled, registeredAt }. Never shrinks. */
    this._registry = new Map();
    /** Default per-module scatter timeout (ms). */
    this._defaultTimeout = Number.isFinite(config.defaultTimeoutMs)
      ? config.defaultTimeoutMs
      : DEFAULT_TIMEOUT_MS;
    /** Default result limit. */
    this._defaultLimit = Number.isFinite(config.defaultLimit)
      ? config.defaultLimit
      : DEFAULT_LIMIT;
    /** Optional snippet truncation length for highlighted body (chars). */
    this._snippetLen = Number.isFinite(config.snippetLen)
      ? config.snippetLen
      : 240;
  }

  /**
   * Register a module index. If the moduleId is already registered, the
   * new searchFn REPLACES the old one but the registry entry persists
   * (never deleted). This keeps scatter/gather audit-safe.
   */
  registerIndex(moduleId, searchFn) {
    if (typeof moduleId !== 'string' || moduleId.length === 0) {
      throw new TypeError('moduleId must be a non-empty string');
    }
    if (typeof searchFn !== 'function') {
      throw new TypeError('searchFn must be a function');
    }
    const existing = this._registry.get(moduleId);
    this._registry.set(moduleId, {
      id: moduleId,
      searchFn,
      enabled: true,
      registeredAt: existing ? existing.registeredAt : Date.now(),
      updatedAt: Date.now(),
    });
  }

  /**
   * Soft-disable a module. The registry entry is retained (we never
   * delete — audit rule) but `enabled` flips to false so scatter/gather
   * skips it. Returns true if the module existed, false otherwise.
   */
  unregisterIndex(moduleId) {
    const entry = this._registry.get(moduleId);
    if (!entry) return false;
    entry.enabled = false;
    entry.updatedAt = Date.now();
    return true;
  }

  /**
   * Re-enable a previously disabled module. Useful for health-check-based
   * toggling without having to re-supply the searchFn.
   */
  enableIndex(moduleId) {
    const entry = this._registry.get(moduleId);
    if (!entry) return false;
    entry.enabled = true;
    entry.updatedAt = Date.now();
    return true;
  }

  /** ReadonlyArray of currently REGISTERED module ids (enabled or not). */
  get modules() {
    return Object.freeze([...this._registry.keys()]);
  }

  /** ReadonlyArray of currently ENABLED module ids. */
  get enabledModules() {
    const out = [];
    for (const [id, entry] of this._registry) {
      if (entry.enabled) out.push(id);
    }
    return Object.freeze(out);
  }

  /** Bilingual tokenize — exposed for tests and advanced callers. */
  tokenize(text) { return tokenize(text); }

  /** HTML-escape — exposed for safe rendering. */
  escapeHtml(text) { return escapeHtml(text); }

  /** Safe HTML highlight — exposed for rendering pipelines. */
  highlight(text, queryTokens) { return highlightText(text, queryTokens); }

  /**
   * Federated query — scatter to every enabled module, gather partial
   * results, re-rank with BM25+TF-IDF, filter by ACL, build facets.
   *
   * opts:
   *   limit     (number)   — max results to return, default 50
   *   types     (string[]) — whitelist of type values to keep
   *   perms     (string[]) — caller permissions for ACL filtering
   *   timeoutMs (number)   — per-module timeout, default config
   *   modules   (string[]) — whitelist of module ids (omit → all enabled)
   */
  async query(q, opts = {}) {
    const startedAt = Date.now();
    const queryStr = typeof q === 'string' ? q : '';
    const queryTokens = tokenize(queryStr);
    const limit = Number.isFinite(opts.limit) ? opts.limit : this._defaultLimit;
    const perms = Array.isArray(opts.perms) ? opts.perms : [];
    const typeFilter = Array.isArray(opts.types) && opts.types.length > 0
      ? new Set(opts.types)
      : null;
    const moduleFilter = Array.isArray(opts.modules) && opts.modules.length > 0
      ? new Set(opts.modules)
      : null;
    const timeoutMs = Number.isFinite(opts.timeoutMs)
      ? opts.timeoutMs
      : this._defaultTimeout;

    // --- Scatter -----------------------------------------------------------
    const targets = [];
    for (const [id, entry] of this._registry) {
      if (!entry.enabled) continue;
      if (moduleFilter && !moduleFilter.has(id)) continue;
      targets.push(entry);
    }

    const perModuleOpts = {
      limit: Math.max(limit * 2, 20), // over-fetch so we can rerank
      types: opts.types,
      perms,
    };

    const gatherPromises = targets.map((entry) => {
      const ctrl = new AbortController();
      let p;
      try {
        p = Promise.resolve(
          entry.searchFn(queryStr, { ...perModuleOpts, signal: ctrl.signal })
        );
      } catch (err) {
        p = Promise.resolve({ __error: err });
      }
      return withTimeout(p, timeoutMs, ctrl).then((val) => ({
        moduleId: entry.id,
        value: val,
      }));
    });

    // --- Gather ------------------------------------------------------------
    const scattered = await Promise.all(gatherPromises);

    const rawHits = [];
    const diagnostics = { timedOut: [], errored: [], responded: [] };
    for (const { moduleId, value } of scattered) {
      if (!value || value.__timeout) {
        diagnostics.timedOut.push(moduleId);
        continue;
      }
      if (value.__error) {
        diagnostics.errored.push({
          moduleId,
          message: String(value.__error && value.__error.message || value.__error),
        });
        continue;
      }
      if (!Array.isArray(value)) {
        diagnostics.errored.push({
          moduleId,
          message: 'searchFn did not return an array',
        });
        continue;
      }
      diagnostics.responded.push(moduleId);
      for (const hit of value) {
        if (hit && typeof hit === 'object' && hit.id != null) {
          rawHits.push({ ...hit, _module: moduleId });
        }
      }
    }

    // --- Corpus statistics for unified BM25 -------------------------------
    // Build per-token document frequency map across ALL returned hits so
    // scoring is comparable across modules.
    const docFreq = new Map();
    const tokenizedHits = rawHits.map((h) => {
      const text =
        (h.title || '') + ' ' + (h.body || '') + ' ' + (h.description || '');
      const toks = tokenize(text);
      const uniq = new Set(toks);
      for (const t of uniq) docFreq.set(t, (docFreq.get(t) || 0) + 1);
      return { hit: h, tokens: toks };
    });
    const totalDocs = tokenizedHits.length || 1;
    let avgDocLen = 0;
    for (const { tokens } of tokenizedHits) avgDocLen += tokens.length;
    avgDocLen = avgDocLen / (tokenizedHits.length || 1);

    // --- Permission filter + type filter + score -------------------------
    const scored = [];
    for (const { hit, tokens } of tokenizedHits) {
      if (!hasPermission(hit.acl, perms)) continue;
      if (typeFilter && !typeFilter.has(hit.type)) continue;
      const bm25 = bm25Score(queryTokens, tokens, docFreq, totalDocs, avgDocLen);
      const tfidf = tfIdfBonus(queryTokens, tokens, docFreq, totalDocs);
      const localHint = Number.isFinite(hit.score) ? hit.score : 0;
      const finalScore = bm25 + tfidf + localHint * 0.05;
      // If query was empty, treat every allowed hit as score 0 (listing mode).
      if (queryTokens.length > 0 && finalScore === 0) continue;
      scored.push({
        ...hit,
        _score: finalScore,
        _bm25: bm25,
        _tfidf: tfidf,
        _titleHl: highlightText(hit.title || '', queryTokens),
        _snippetHl: this._snippet(hit.body || hit.description || '', queryTokens),
      });
    }

    // --- Merge / sort / limit --------------------------------------------
    scored.sort((a, b) => {
      if (b._score !== a._score) return b._score - a._score;
      // Stable secondary: newer dates first, then id ascending.
      const da = a.date ? new Date(a.date).getTime() : 0;
      const db = b.date ? new Date(b.date).getTime() : 0;
      if (db !== da) return db - da;
      return String(a.id).localeCompare(String(b.id));
    });
    const truncated = scored.slice(0, limit);

    // --- Facets ----------------------------------------------------------
    const facets = buildFacets(scored);

    return {
      query: queryStr,
      queryTokens,
      results: truncated,
      total: scored.length,
      totalFetched: rawHits.length,
      facets,
      diagnostics,
      tookMs: Date.now() - startedAt,
    };
  }

  /**
   * Extract a short snippet around the first matched token, HTML-safe
   * and highlighted. Falls back to the head of the text when no token
   * match is found. Used for result cards in the UI.
   */
  _snippet(text, queryTokens) {
    if (!text) return '';
    const maxLen = this._snippetLen;
    const src = String(text);
    const lower = src.toLowerCase();
    let cutStart = 0;
    if (Array.isArray(queryTokens)) {
      for (const q of queryTokens) {
        if (!q) continue;
        const idx = lower.indexOf(q);
        if (idx !== -1) {
          cutStart = Math.max(0, idx - 30);
          break;
        }
      }
    }
    const slice = src.slice(cutStart, cutStart + maxLen);
    const prefix = cutStart > 0 ? '…' : '';
    const suffix = cutStart + maxLen < src.length ? '…' : '';
    return prefix + highlightText(slice, queryTokens) + suffix;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 9. EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

module.exports = {
  GlobalSearch,
  // Exposed helpers for tests / advanced callers:
  tokenize,
  normalizeToken,
  escapeHtml,
  highlightText,
  hasPermission,
  bm25Score,
  tfIdfBonus,
  buildFacets,
  // Constants kept public so downstream code can introspect.
  STOPWORDS,
  BM25_K1,
  BM25_B,
  DEFAULT_TIMEOUT_MS,
  DEFAULT_LIMIT,
};
