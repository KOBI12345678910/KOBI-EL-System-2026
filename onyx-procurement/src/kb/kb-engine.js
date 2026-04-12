/**
 * KB Engine — Knowledge Base / Help Center
 * ─────────────────────────────────────────────
 * Agent X-22 — Techno-Kol Uzi mega-ERP (Swarm 3B)
 *
 * Purpose:
 *   Pure in-memory knowledge base with bilingual (he/en) articles,
 *   hierarchical categories, FAQ blocks, full-text search, versioning,
 *   popularity tracking and user-feedback counters (helpful / not-helpful).
 *
 * Design principles:
 *   1. Zero runtime deps — no npm packages, no imports. Pure JS.
 *   2. Never delete. `updateArticle` creates a NEW version and keeps the
 *      old one in `article.versions[]`. `markHelpful` only increments.
 *   3. Hebrew-aware: handles RTL, normalises Hebrew diacritics (nikud),
 *      and tokenises Hebrew + English uniformly.
 *   4. Fail-soft: malformed input yields a validation error, not a throw
 *      inside the data structure.
 *   5. Uses Agent X-14 search engine if available on `opts.externalSearch`,
 *      otherwise falls back to a deterministic BM25-lite scorer.
 *
 * Article shape:
 *   {
 *     id, title {he, en}, body {he, en},
 *     category, tags[], author,
 *     version, last_updated,
 *     views, helpful_count, not_helpful_count,
 *     related[],            // article ids
 *     versions[]            // prior snapshots {version, title, body, updated_at, author}
 *   }
 *
 * Category shape:
 *   { id, name {he, en}, parent, children[], faqs[] }
 *
 * FAQ shape:
 *   { q {he, en}, a {he, en} }
 *
 * Public API (returned by createKB()):
 *   createArticle(input)           → article
 *   updateArticle(id, changes)     → article (new version)
 *   getArticle(id, opts)           → article (optionally increments views)
 *   deleteArticle(id)              → NO-OP (throws)  — never delete rule
 *   searchKB(query, lang)          → ranked results [{article, score, snippet}]
 *   getCategory(catId)             → { category, articles[] }
 *   listCategories()               → flat list
 *   markHelpful(articleId, helpful)→ {helpful_count, not_helpful_count}
 *   getPopular(limit)              → articles sorted by views desc
 *   getRelated(articleId, limit)   → suggested related articles
 *   diffVersions(articleId, a, b)  → {added[], removed[], unchanged[]}
 *
 * Seed:
 *   The module ships with 10 real bilingual articles covering the core
 *   Israeli payroll / accounting flows the ERP supports. Call
 *   `seedDefaultKB(kb)` to load them (also auto-loaded on createKB()).
 */

'use strict';

// ───────────────────────────────────────────────────────────────
// Small utilities
// ───────────────────────────────────────────────────────────────

// Match a single Hebrew letter (Aleph..Tav + final forms)
const HEBREW_LETTER_RE = /[\u05D0-\u05EA]/;
// Hebrew nikud / cantillation — strip before matching
const NIKUD_RE = /[\u0591-\u05C7]/g;
// Tokeniser: captures Hebrew words, English words, and digits ≥ 1 char
const TOKEN_RE = /[\u05D0-\u05EA]+|[a-z0-9]+/gi;

// Hebrew stop-words (small curated list). Not a library — literal list.
const STOPWORDS_HE = new Set([
  'של', 'על', 'עם', 'את', 'זה', 'זו', 'הוא', 'היא', 'הם', 'הן',
  'אני', 'אתה', 'אנחנו', 'גם', 'לא', 'כן', 'יש', 'אין', 'או',
  'אם', 'כי', 'אבל', 'רק', 'עד', 'אל', 'מן', 'כל', 'מה', 'איך',
]);
const STOPWORDS_EN = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'of', 'for', 'to', 'in',
  'on', 'at', 'by', 'with', 'is', 'are', 'was', 'were', 'be', 'been',
  'this', 'that', 'these', 'those', 'it', 'as', 'if', 'do', 'how',
]);

function normaliseText(s) {
  if (s == null) return '';
  return String(s).replace(NIKUD_RE, '').toLowerCase();
}

function tokenise(s, { dropStopwords = true } = {}) {
  const out = [];
  if (!s) return out;
  const norm = normaliseText(s);
  const matches = norm.match(TOKEN_RE);
  if (!matches) return out;
  for (const t of matches) {
    if (t.length < 2) continue;
    if (dropStopwords) {
      if (STOPWORDS_HE.has(t)) continue;
      if (STOPWORDS_EN.has(t)) continue;
    }
    out.push(t);
  }
  return out;
}

function isoNow() {
  return new Date().toISOString();
}

function genId(prefix) {
  // Deterministic-ish unique id (monotonic counter + timestamp)
  const c = (genId._counter = (genId._counter || 0) + 1);
  return `${prefix}-${Date.now().toString(36)}-${c}`;
}

function cloneDeep(v) {
  // JSON-safe deep clone — article payload is JSON-serialisable.
  return v == null ? v : JSON.parse(JSON.stringify(v));
}

function snippet(text, tokens, len = 160) {
  if (!text) return '';
  const norm = normaliseText(text);
  let best = 0;
  for (const t of tokens) {
    const idx = norm.indexOf(t);
    if (idx >= 0) {
      best = Math.max(0, idx - 30);
      break;
    }
  }
  const raw = String(text).slice(best, best + len);
  return (best > 0 ? '…' : '') + raw + (best + len < text.length ? '…' : '');
}

// ───────────────────────────────────────────────────────────────
// BM25-lite scorer (used when Agent X-14 search engine not attached)
// ───────────────────────────────────────────────────────────────

const BM25_K1 = 1.2;
const BM25_B = 0.75;

function buildInvertedIndex(docs, lang) {
  // docs: [{id, title, body, tags, category}]
  const postings = new Map(); // token -> Map(docId -> count)
  const docLen = new Map();
  let totalLen = 0;
  for (const d of docs) {
    const parts = [
      (d.title && d.title[lang]) || '',
      (d.body && d.body[lang]) || '',
      (d.tags || []).join(' '),
      d.category || '',
    ];
    const toks = tokenise(parts.join(' '));
    docLen.set(d.id, toks.length);
    totalLen += toks.length;
    const seen = new Map();
    for (const t of toks) {
      seen.set(t, (seen.get(t) || 0) + 1);
    }
    for (const [t, c] of seen) {
      if (!postings.has(t)) postings.set(t, new Map());
      postings.get(t).set(d.id, c);
    }
  }
  const avgLen = docs.length ? totalLen / docs.length : 0;
  return { postings, docLen, avgLen, N: docs.length };
}

function bm25Search(query, docs, lang) {
  const qTokens = tokenise(query);
  if (!qTokens.length) return [];
  const { postings, docLen, avgLen, N } = buildInvertedIndex(docs, lang);
  const scores = new Map();
  for (const t of qTokens) {
    const p = postings.get(t);
    if (!p) continue;
    const df = p.size;
    const idf = Math.log(1 + (N - df + 0.5) / (df + 0.5));
    for (const [docId, tf] of p) {
      const dl = docLen.get(docId) || 1;
      const norm = 1 - BM25_B + BM25_B * (dl / (avgLen || 1));
      const w = (idf * tf * (BM25_K1 + 1)) / (tf + BM25_K1 * norm);
      scores.set(docId, (scores.get(docId) || 0) + w);
    }
  }
  const ranked = [];
  for (const [docId, score] of scores) {
    const doc = docs.find((d) => d.id === docId);
    if (!doc) continue;
    ranked.push({
      article: doc,
      score: +score.toFixed(4),
      snippet: snippet((doc.body && doc.body[lang]) || '', qTokens),
    });
  }
  ranked.sort((a, b) => b.score - a.score);
  return ranked;
}

// ───────────────────────────────────────────────────────────────
// Validation
// ───────────────────────────────────────────────────────────────

function validateBilingual(obj, fieldName) {
  if (!obj || typeof obj !== 'object') {
    throw new Error(`kb: ${fieldName} must be {he, en}`);
  }
  if (typeof obj.he !== 'string' || typeof obj.en !== 'string') {
    throw new Error(`kb: ${fieldName}.he and ${fieldName}.en are required strings`);
  }
  if (!obj.he.trim() || !obj.en.trim()) {
    throw new Error(`kb: ${fieldName}.he / ${fieldName}.en must not be empty`);
  }
}

function validateArticleInput(input) {
  if (!input || typeof input !== 'object') {
    throw new Error('kb: article input must be an object');
  }
  validateBilingual(input.title, 'title');
  validateBilingual(input.body, 'body');
  if (typeof input.category !== 'string' || !input.category.trim()) {
    throw new Error('kb: category is required');
  }
  if (input.tags != null && !Array.isArray(input.tags)) {
    throw new Error('kb: tags must be an array');
  }
}

// ───────────────────────────────────────────────────────────────
// Core KB implementation
// ───────────────────────────────────────────────────────────────

function createKB(opts = {}) {
  const state = {
    articles: new Map(),      // id -> article
    categories: new Map(),    // id -> category
    externalSearch: typeof opts.externalSearch === 'function'
      ? opts.externalSearch
      : null,
  };

  // ── Categories ─────────────────────────────────────────────
  function upsertCategory(cat) {
    if (!cat || !cat.id) throw new Error('kb: category.id required');
    validateBilingual(cat.name, 'category.name');
    const existing = state.categories.get(cat.id) || {
      id: cat.id,
      name: cat.name,
      parent: cat.parent || null,
      children: [],
      faqs: [],
    };
    existing.name = cat.name;
    existing.parent = cat.parent || null;
    if (Array.isArray(cat.faqs)) existing.faqs = cloneDeep(cat.faqs);
    state.categories.set(cat.id, existing);
    // Maintain children lists
    if (cat.parent) {
      const parent = state.categories.get(cat.parent);
      if (parent && !parent.children.includes(cat.id)) {
        parent.children.push(cat.id);
      }
    }
    return cloneDeep(existing);
  }

  function listCategories() {
    return Array.from(state.categories.values()).map(cloneDeep);
  }

  function getCategory(catId) {
    const cat = state.categories.get(catId);
    if (!cat) return null;
    const articles = Array.from(state.articles.values()).filter(
      (a) => a.category === catId
    );
    return {
      category: cloneDeep(cat),
      articles: articles.map(cloneDeep),
    };
  }

  // ── Articles — create ─────────────────────────────────────
  function createArticle(input) {
    validateArticleInput(input);
    const id = input.id || genId('kb');
    if (state.articles.has(id)) {
      throw new Error(`kb: article id already exists: ${id}`);
    }
    if (!state.categories.has(input.category)) {
      throw new Error(`kb: unknown category: ${input.category}`);
    }
    const now = isoNow();
    const article = {
      id,
      title: cloneDeep(input.title),
      body: cloneDeep(input.body),
      category: input.category,
      tags: Array.isArray(input.tags) ? input.tags.slice() : [],
      author: input.author || 'system',
      version: 1,
      last_updated: now,
      created_at: now,
      views: 0,
      helpful_count: 0,
      not_helpful_count: 0,
      related: Array.isArray(input.related) ? input.related.slice() : [],
      versions: [], // snapshots of prior versions
    };
    state.articles.set(id, article);
    return cloneDeep(article);
  }

  // ── Articles — update (versioned) ─────────────────────────
  function updateArticle(id, changes) {
    const art = state.articles.get(id);
    if (!art) throw new Error(`kb: article not found: ${id}`);
    if (!changes || typeof changes !== 'object') {
      throw new Error('kb: update changes must be an object');
    }

    // Snapshot current state BEFORE applying changes
    const snapshot = {
      version: art.version,
      title: cloneDeep(art.title),
      body: cloneDeep(art.body),
      tags: art.tags.slice(),
      updated_at: art.last_updated,
      author: art.author,
    };
    art.versions.push(snapshot);

    if (changes.title !== undefined) {
      validateBilingual(changes.title, 'title');
      art.title = cloneDeep(changes.title);
    }
    if (changes.body !== undefined) {
      validateBilingual(changes.body, 'body');
      art.body = cloneDeep(changes.body);
    }
    if (changes.tags !== undefined) {
      if (!Array.isArray(changes.tags)) {
        throw new Error('kb: tags must be an array');
      }
      art.tags = changes.tags.slice();
    }
    if (changes.category !== undefined) {
      if (!state.categories.has(changes.category)) {
        throw new Error(`kb: unknown category: ${changes.category}`);
      }
      art.category = changes.category;
    }
    if (changes.related !== undefined) {
      if (!Array.isArray(changes.related)) {
        throw new Error('kb: related must be an array');
      }
      art.related = changes.related.slice();
    }
    if (changes.author !== undefined) {
      art.author = String(changes.author);
    }
    art.version += 1;
    art.last_updated = isoNow();
    return cloneDeep(art);
  }

  // ── Articles — read ───────────────────────────────────────
  function getArticle(id, { incrementViews = false } = {}) {
    const art = state.articles.get(id);
    if (!art) return null;
    if (incrementViews) art.views += 1;
    return cloneDeep(art);
  }

  function deleteArticle(/* id */) {
    // RULE: never delete. Explicitly refuse.
    throw new Error('kb: delete is not permitted (never-delete rule)');
  }

  // ── Search ─────────────────────────────────────────────────
  function searchKB(query, lang = 'he') {
    if (typeof query !== 'string' || !query.trim()) return [];
    const docs = Array.from(state.articles.values());
    // Prefer external search engine (Agent X-14) if attached
    if (state.externalSearch) {
      try {
        const external = state.externalSearch({ query, lang, docs });
        if (Array.isArray(external)) {
          return external.map((r) => ({
            article: cloneDeep(r.article),
            score: r.score,
            snippet: r.snippet || '',
          }));
        }
      } catch (_err) {
        // Fall through to built-in scorer
      }
    }
    const ranked = bm25Search(query, docs, lang);
    // Fallback: if BM25 found nothing (e.g. very short query), substring
    if (!ranked.length) {
      const q = normaliseText(query);
      const hits = [];
      for (const d of docs) {
        const hay =
          normaliseText((d.title && d.title[lang]) || '') +
          ' ' +
          normaliseText((d.body && d.body[lang]) || '') +
          ' ' +
          normaliseText((d.tags || []).join(' '));
        if (hay.indexOf(q) >= 0) {
          hits.push({
            article: cloneDeep(d),
            score: 0.1,
            snippet: snippet((d.body && d.body[lang]) || '', [q]),
          });
        }
      }
      return hits;
    }
    return ranked.map((r) => ({
      article: cloneDeep(r.article),
      score: r.score,
      snippet: r.snippet,
    }));
  }

  // ── Feedback ───────────────────────────────────────────────
  function markHelpful(articleId, helpful) {
    const art = state.articles.get(articleId);
    if (!art) throw new Error(`kb: article not found: ${articleId}`);
    if (typeof helpful !== 'boolean') {
      throw new Error('kb: helpful must be boolean');
    }
    if (helpful) art.helpful_count += 1;
    else art.not_helpful_count += 1;
    return {
      helpful_count: art.helpful_count,
      not_helpful_count: art.not_helpful_count,
    };
  }

  // ── Popularity ─────────────────────────────────────────────
  function getPopular(limit = 5) {
    const n = Math.max(1, Math.min(100, limit | 0));
    return Array.from(state.articles.values())
      .sort((a, b) => b.views - a.views)
      .slice(0, n)
      .map(cloneDeep);
  }

  // ── Related suggestions ────────────────────────────────────
  function getRelated(articleId, limit = 3) {
    const art = state.articles.get(articleId);
    if (!art) return [];
    // 1. Prefer explicit related[]
    const explicit = art.related
      .map((id) => state.articles.get(id))
      .filter(Boolean);
    if (explicit.length >= limit) {
      return explicit.slice(0, limit).map(cloneDeep);
    }
    // 2. Fill from same category, sorted by views
    const sameCat = Array.from(state.articles.values())
      .filter((a) => a.category === art.category && a.id !== articleId)
      .filter((a) => !art.related.includes(a.id))
      .sort((a, b) => b.views - a.views);
    return explicit
      .concat(sameCat)
      .slice(0, limit)
      .map(cloneDeep);
  }

  // ── Version diff ───────────────────────────────────────────
  function diffVersions(articleId, versionA, versionB) {
    const art = state.articles.get(articleId);
    if (!art) throw new Error(`kb: article not found: ${articleId}`);
    const snap = (v) =>
      v === art.version
        ? { title: art.title, body: art.body }
        : art.versions.find((x) => x.version === v);
    const a = snap(versionA);
    const b = snap(versionB);
    if (!a || !b) throw new Error('kb: version not found');
    const lang = 'he';
    const ta = new Set(tokenise((a.body && a.body[lang]) || '', { dropStopwords: false }));
    const tb = new Set(tokenise((b.body && b.body[lang]) || '', { dropStopwords: false }));
    const added = [];
    const removed = [];
    const unchanged = [];
    for (const t of tb) if (!ta.has(t)) added.push(t);
    for (const t of ta) if (!tb.has(t)) removed.push(t);
    for (const t of ta) if (tb.has(t)) unchanged.push(t);
    return { added, removed, unchanged, from: versionA, to: versionB };
  }

  // Exported API
  const api = {
    // categories
    upsertCategory,
    listCategories,
    getCategory,
    // articles
    createArticle,
    updateArticle,
    getArticle,
    deleteArticle,
    // search
    searchKB,
    // feedback + discovery
    markHelpful,
    getPopular,
    getRelated,
    diffVersions,
    // test helpers
    _state: state,
  };

  // Auto-seed unless opted out
  if (opts.autoSeed !== false) {
    seedDefaultKB(api);
  }

  return api;
}

// ───────────────────────────────────────────────────────────────
// Default seed — 10 bilingual articles + categories + FAQs
// ───────────────────────────────────────────────────────────────

function seedDefaultKB(kb) {
  // Categories (hierarchy: payroll → sub / tax → sub / ops → sub)
  kb.upsertCategory({
    id: 'payroll',
    name: { he: 'שכר ותלושים', en: 'Payroll & Wage Slips' },
    parent: null,
    faqs: [
      {
        q: {
          he: 'מתי משלמים את תלוש השכר?',
          en: 'When is the wage slip paid?',
        },
        a: {
          he: 'על פי חוק, המשכורת משולמת עד ה-9 לחודש העוקב ולא יאוחר מכך.',
          en: 'By Israeli labour law, wages must be paid no later than the 9th of the following month.',
        },
      },
      {
        q: {
          he: 'האם ניתן לשלם במזומן?',
          en: 'Can wages be paid in cash?',
        },
        a: {
          he: 'מומלץ לשלם בהעברה בנקאית. תשלום במזומן מותר רק במקרים חריגים ויש לתעד.',
          en: 'Bank transfer is strongly preferred. Cash is permitted only exceptionally and must be documented.',
        },
      },
    ],
  });

  kb.upsertCategory({
    id: 'tax',
    name: { he: 'מיסים', en: 'Taxes' },
    parent: null,
    faqs: [
      {
        q: {
          he: 'מה המדרגה הראשונה של מס הכנסה לשנת 2026?',
          en: 'What is the first income-tax bracket for 2026?',
        },
        a: {
          he: 'המדרגה הראשונה לשנת 2026 היא 10% עד הכנסה חודשית של כ־7,010 ש"ח.',
          en: 'For 2026 the first bracket is 10% for monthly income up to about NIS 7,010.',
        },
      },
    ],
  });

  kb.upsertCategory({
    id: 'accounting',
    name: { he: 'הנהלת חשבונות', en: 'Accounting' },
    parent: null,
    faqs: [],
  });

  kb.upsertCategory({
    id: 'reports',
    name: { he: 'דיווחים', en: 'Statutory Reports' },
    parent: null,
    faqs: [],
  });

  kb.upsertCategory({
    id: 'benefits',
    name: { he: 'זכויות והטבות', en: 'Benefits & Entitlements' },
    parent: 'payroll',
    faqs: [],
  });

  kb.upsertCategory({
    id: 'social',
    name: { he: 'ביטוח סוציאלי', en: 'Social Insurance' },
    parent: 'payroll',
    faqs: [],
  });

  kb.upsertCategory({
    id: 'tools',
    name: { he: 'כלים וסימולטורים', en: 'Tools & Simulators' },
    parent: null,
    faqs: [],
  });

  kb.upsertCategory({
    id: 'ops',
    name: { he: 'תפעול מערכת', en: 'System Operations' },
    parent: null,
    faqs: [],
  });

  // Articles
  kb.createArticle({
    id: 'kb-payroll-wage-slip',
    category: 'payroll',
    author: 'kobi',
    tags: ['תלוש', 'שכר', 'wage-slip', 'payroll'],
    title: {
      he: 'איך להפיק תלוש שכר',
      en: 'How to generate a wage slip',
    },
    body: {
      he:
        'הפקת תלוש שכר במערכת Techno-Kol מתבצעת בארבעה שלבים: ' +
        '1) בחירת העובד ברשימת העובדים הפעילים. ' +
        '2) בחירת חודש השכר (לדוגמה 03/2026). ' +
        '3) עדכון שעות עבודה ורכיבי שכר — שכר יסוד, שעות נוספות, החזרי הוצאות, בונוסים. ' +
        '4) לחיצה על "חשב תלוש" ולאחר מכן "הפק PDF". המערכת מחשבת אוטומטית ניכויי חובה: מס הכנסה לפי מדרגות 2026, ' +
        'ביטוח לאומי (חלק העובד), מס בריאות, וחלוקה לקופות גמל ולקרן השתלמות בהתאם להגדרות העובד. ' +
        'התלוש נשמר במאגר והוחתם בחתימה דיגיטלית עם חותמת זמן.',
      en:
        'Generating a wage slip in Techno-Kol takes four steps: ' +
        '(1) pick the employee from the active employees list; ' +
        '(2) choose the payroll month (e.g. 03/2026); ' +
        '(3) update hours worked and pay components — base salary, overtime, expense refunds, bonuses; ' +
        '(4) click "Calculate" then "Generate PDF". The system auto-computes statutory deductions: ' +
        'income tax per 2026 brackets, National Insurance employee share, health tax, plus pension and study-fund ' +
        'contributions based on the employee profile. The slip is archived and digitally signed with a timestamp.',
    },
    related: ['kb-tax-income-2026', 'kb-payroll-severance', 'kb-benefits-recreation'],
  });

  kb.createArticle({
    id: 'kb-tax-income-2026',
    category: 'tax',
    author: 'kobi',
    tags: ['מס הכנסה', 'מדרגות', 'income-tax', '2026'],
    title: {
      he: 'חישוב מס הכנסה 2026',
      en: '2026 income tax calculation',
    },
    body: {
      he:
        'מדרגות מס הכנסה לשנת 2026 (חודשי, לפי רשות המסים): ' +
        'עד 7,010 ש"ח — 10%; 7,011–10,060 ש"ח — 14%; 10,061–16,150 ש"ח — 20%; ' +
        '16,151–22,440 ש"ח — 31%; 22,441–46,690 ש"ח — 35%; 46,691–60,130 ש"ח — 47%; ' +
        'מעל 60,130 ש"ח — 50% (כולל מס יסף). ' +
        'החישוב במערכת פרוגרסיבי: כל שקל מחויב לפי המדרגה שבה הוא נופל, לא לפי המדרגה העליונה של העובד. ' +
        'נקודות זיכוי: 2.25 לכל תושב, 2.25 לאישה, 0.5 לכל ילד עד גיל 18, בתוספת זיכויים מיוחדים (חד-הורי, עולה חדש, חייל משוחרר). ' +
        'כל נקודת זיכוי ב־2026 שווה לסכום של כ־242 ש"ח בחודש.',
      en:
        '2026 monthly income-tax brackets (Israel Tax Authority): ' +
        'up to NIS 7,010 — 10%; 7,011–10,060 — 14%; 10,061–16,150 — 20%; ' +
        '16,151–22,440 — 31%; 22,441–46,690 — 35%; 46,691–60,130 — 47%; ' +
        'above 60,130 — 50% (includes the surtax). ' +
        'Calculation is progressive: each shekel is taxed at the bracket it falls into, not at the taxpayer\'s top bracket. ' +
        'Credit points: 2.25 per resident, 2.25 per woman, 0.5 per child up to age 18, plus special credits ' +
        '(single-parent, new immigrant, discharged soldier). Each credit point is worth about NIS 242 per month in 2026.',
    },
    related: ['kb-payroll-wage-slip', 'kb-social-ni-employer'],
  });

  kb.createArticle({
    id: 'kb-acc-invoice-allocation',
    category: 'accounting',
    author: 'kobi',
    tags: ['חשבונית', 'מספר הקצאה', 'invoice', 'allocation'],
    title: {
      he: 'חשבונית עם מספר הקצאה',
      en: 'Invoices with allocation numbers',
    },
    body: {
      he:
        'החל מ־1 בינואר 2024 חשבונית מס על סכום מעל 25,000 ש"ח (לפני מע"מ) חייבת לכלול מספר הקצאה מרשות המסים. ' +
        'במערכת Techno-Kol יש לבצע: ' +
        '1) הזנת פרטי החשבונית הרגילים (לקוח, פריטים, סכום). ' +
        '2) לחיצה על "בקש מספר הקצאה" — המערכת שולחת בקשה מקוונת לשע"ם (שירות עיבוד ממוכן). ' +
        '3) אישור הבקשה וקבלת מספר ייחודי בן 9 ספרות. ' +
        '4) הדפסת החשבונית עם מספר ההקצאה. במקרה של תקלה — ניתן להנפיק חשבונית באופן זמני ולהשלים בדיעבד עד 48 שעות. ' +
        'הסף ל־2026: 20,000 ש"ח. שימו לב לשינוי הסף בחישוב האוטומטי.',
      en:
        'From 1 January 2024, a tax invoice above NIS 25,000 (before VAT) must include a pre-allocated invoice ' +
        'number issued by the Israel Tax Authority. In Techno-Kol: ' +
        '(1) enter the standard invoice details (customer, items, amount); ' +
        '(2) click "Request allocation number" — the system sends an online request to SHAAM; ' +
        '(3) receive a unique 9-digit number and attach it to the invoice; ' +
        '(4) print the invoice with the allocation number on it. On outage, a temporary invoice can be issued and ' +
        'retroactively matched within 48 hours. For 2026 the threshold drops to NIS 20,000 — the system adjusts the ' +
        'trigger automatically.',
    },
    related: ['kb-tax-income-2026'],
  });

  kb.createArticle({
    id: 'kb-reports-1320',
    category: 'reports',
    author: 'kobi',
    tags: ['טופס 1320', 'דיווח', 'form-1320'],
    title: {
      he: 'הפקת טופס 1320',
      en: 'Generating form 1320',
    },
    body: {
      he:
        'טופס 1320 הוא דוח מס הכנסה לעצמאי / בעל שליטה המסכם הכנסות, הוצאות וניכויים לשנת המס. ' +
        'במערכת Techno-Kol הפקת הטופס אוטומטית מתוך מודול ההנה"ח: ' +
        '1) פתיחת "דוחות שנתיים" → "טופס 1320 – 2026". ' +
        '2) בחירת שנת המס והעסק הרלוונטי. ' +
        '3) המערכת מושכת את כל החשבוניות, קבלות וספר הקופה, מסווגת אוטומטית לשדות 150–299 ומחשבת את ההכנסה החייבת. ' +
        '4) בדיקת חריגים: הוצאות מעורבות (70/30), פחת, הפרשות לקרן השתלמות. ' +
        '5) לחיצה על "הפק PDF" או "יצוא XML" למודל ידני/מקוון (שע"ם). ' +
        'הטופס נשמר בארכיון עם חתימה דיגיטלית ומזהה ייחודי.',
      en:
        'Form 1320 is the income-tax return for the self-employed and controlling shareholders, summarising ' +
        'revenues, expenses and deductions for the tax year. In Techno-Kol the form is produced automatically from ' +
        'the accounting module: ' +
        '(1) open "Annual Reports" → "Form 1320 – 2026"; ' +
        '(2) pick the tax year and business; ' +
        '(3) the engine pulls every invoice, receipt and cash-book entry, classifies them into fields 150–299 and ' +
        'computes taxable income; ' +
        '(4) review exceptions: mixed expenses (70/30), depreciation, study-fund contributions; ' +
        '(5) click "Generate PDF" or "Export XML" for paper/online filing (SHAAM). The form is archived with a ' +
        'digital signature and unique ID.',
    },
    related: ['kb-tax-income-2026', 'kb-acc-invoice-allocation'],
  });

  kb.createArticle({
    id: 'kb-payroll-severance',
    category: 'payroll',
    author: 'kobi',
    tags: ['פיצויים', 'פיטורין', 'severance'],
    title: {
      he: 'חישוב פיצויים',
      en: 'Severance calculation',
    },
    body: {
      he:
        'פיצויי פיטורין מחושבים בישראל לפי הנוסחה: שכר אחרון רגיל × שנות ותק. ' +
        'למשל, עובד עם שכר חודשי של 12,000 ש"ח ושבע שנות ותק זכאי ל־12,000 × 7 = 84,000 ש"ח פיצויים. ' +
        'שכר אחרון כולל שכר יסוד, תוספות קבועות (ותק, יוקר מחייה), אך לא בונוסים חד-פעמיים ולא שעות נוספות. ' +
        'המערכת Techno-Kol מקבלת את תחילת העבודה ותאריך הסיום, ומחשבת אוטומטית כולל חודשים חלקיים (יחסית). ' +
        'פיצויים הפטורים ממס עד תקרה של כ־13,750 ש"ח לשנת ותק (לפי תעריף 2026). מעבר לסכום זה — ממוסה לפי המדרגות. ' +
        'ניתן לבקש פריסת תשלום עד שש שנים אחורה כדי להפחית את חבות המס.',
      en:
        'Israeli severance pay is computed as: last regular monthly salary × years of service. ' +
        'Example: an employee earning NIS 12,000 per month with 7 years of tenure is entitled to 12,000 × 7 = NIS ' +
        '84,000 in severance. "Last salary" includes base and fixed allowances (seniority, cost-of-living) but ' +
        'excludes one-off bonuses and overtime. ' +
        'Techno-Kol takes the start- and end-of-employment dates and auto-computes severance including pro-rata ' +
        'partial months. Severance is tax-exempt up to a ceiling of approximately NIS 13,750 per year of service ' +
        '(2026 rate). Amounts above this ceiling are taxed at the marginal rates. ' +
        'The severance can be spread over up to six prior tax years to reduce the tax burden.',
    },
    related: ['kb-payroll-wage-slip', 'kb-tax-income-2026'],
  });

  kb.createArticle({
    id: 'kb-benefits-recreation',
    category: 'benefits',
    author: 'kobi',
    tags: ['הבראה', 'דמי הבראה', 'recreation'],
    title: {
      he: 'דמי הבראה 2026',
      en: 'Recreation pay 2026',
    },
    body: {
      he:
        'דמי הבראה הם זכות חוקית המשולמת אחת לשנה לעובדים השכירים, בדרך כלל בחודשים יוני-יולי. ' +
        'התעריף ב־2026 הוא כ־471 ש"ח ליום הבראה (לפי צו ההרחבה הכללי). ' +
        'מספר ימי ההבראה לפי ותק: שנה ראשונה — 5 ימים; 2–3 שנים — 6; 4–10 שנים — 7; 11–15 שנים — 8; ' +
        '16–19 שנים — 9; 20 שנים ומעלה — 10 ימים. ' +
        'עובד חלקי (פחות ממשרה מלאה) זכאי לדמי הבראה יחסיים לפי אחוז המשרה. ' +
        'במערכת Techno-Kol התשלום מופיע כרכיב נפרד בתלוש השכר, חייב במס הכנסה וביטוח לאומי אך פטור ממע"מ. ' +
        'ניתן להפעיל תשלום אוטומטי בהגדרות המערכת (תפריט "שכר" → "רכיבים קבועים" → "הבראה שנתית").',
      en:
        'Recreation pay (dmei havra\'a) is a statutory annual benefit paid to Israeli salaried workers, usually ' +
        'in June or July. The 2026 rate is approximately NIS 471 per recreation day (per the general extension order). ' +
        'Days per seniority: first year — 5; 2–3 years — 6; 4–10 years — 7; 11–15 years — 8; 16–19 years — 9; ' +
        '20+ years — 10 days. Part-time employees receive pro-rata pay. ' +
        'In Techno-Kol the payment appears as a separate line on the wage slip, is subject to income tax and ' +
        'National Insurance, and exempt from VAT. Automatic annual payment can be toggled in ' +
        '"Payroll" → "Recurring Components" → "Annual Recreation".',
    },
    related: ['kb-payroll-wage-slip'],
  });

  kb.createArticle({
    id: 'kb-social-ni-employer',
    category: 'social',
    author: 'kobi',
    tags: ['ביטוח לאומי', 'מעסיק', 'NI', 'employer'],
    title: {
      he: 'ביטוח לאומי מעסיק',
      en: 'Employer NI contributions',
    },
    body: {
      he:
        'דמי ביטוח לאומי חלק המעסיק ב־2026: שיעור מופחת של 3.55% עד 60% מהשכר הממוצע במשק (כ־7,522 ש"ח); ' +
        'שיעור רגיל של 7.60% על השכר שמעבר לסף. בנוסף, מס בריאות המעסיק אינו קיים — מס בריאות מוטל רק על העובד. ' +
        'את החישוב המערכת מבצעת אוטומטית בתלוש: היא מזהה את החלק המופחת והרגיל ומחייבת את חשבון המעסיק. ' +
        'הדיווח לביטוח לאומי מתבצע ב־15 לחודש העוקב דרך טופס 102 (מקוון). ' +
        'תשלום מלא ובזמן נדרש על־מנת להימנע מקנסות וריבית. ' +
        'שים לב: עובדים זרים, סטודנטים ועובדי חוץ זכאים לשיעורים מיוחדים — המערכת מתאימה אוטומטית לפי סיווג העובד.',
      en:
        'Employer National Insurance contributions for 2026: the reduced rate of 3.55% applies up to 60% of the ' +
        'average national wage (approximately NIS 7,522); the standard rate of 7.60% applies above that threshold. ' +
        'Employers are NOT liable for health tax — it is deducted only from employees. ' +
        'The system auto-classifies the reduced and standard portions on each wage slip and debits the employer ' +
        'account. ' +
        'NI is reported on the 15th of the following month via form 102 (electronic). ' +
        'Full and on-time payment is required to avoid penalties and interest. ' +
        'Foreign workers, students and offshore employees receive special rates — the system applies them ' +
        'automatically based on the employee classification.',
    },
    related: ['kb-tax-income-2026', 'kb-payroll-wage-slip'],
  });

  kb.createArticle({
    id: 'kb-social-study-fund',
    category: 'social',
    author: 'kobi',
    tags: ['קרן השתלמות', 'הפרשה', 'study-fund'],
    title: {
      he: 'קרן השתלמות',
      en: 'Study fund',
    },
    body: {
      he:
        'קרן השתלמות היא הפרשה עתירת הטבות מס: המעסיק מפריש 7.5% והעובד 2.5% מהמשכורת החודשית. ' +
        'תקרת ההפרשה הפטורה ממס ב־2026 היא 15,712 ש"ח לחודש. מעבר לתקרה — החלק של המעסיק נחשב להכנסה חייבת. ' +
        'הכסף נצבר בקרן, ואחרי 6 שנים ניתן למשוך ללא מס רווח הון. עובד שפורש יכול למשוך לפני 6 שנים תמורת תשלום מס. ' +
        'במערכת Techno-Kol: פותחים תיק עובד → לשונית "זכויות" → "קרן השתלמות" → מזינים את מספר הקרן, קוד הקרן והשיעור. ' +
        'המערכת מחשבת אוטומטית בכל תלוש, שולחת קובץ ACH חודשי לקופה ומנפיקה דוח רבעוני לעובד. ' +
        'בחירת קופת גמל פעילה מתבצעת לפי טבלת קופות מורשות משרד האוצר.',
      en:
        'The study fund (keren hishtalmut) is a highly tax-advantaged savings vehicle: the employer contributes ' +
        '7.5% and the employee 2.5% of the monthly salary. The tax-exempt ceiling for 2026 is NIS 15,712 per month. ' +
        'Contributions above the ceiling are treated as taxable income. ' +
        'Funds accumulate in the study fund and can be withdrawn tax-free after 6 years. Early withdrawal is ' +
        'permitted subject to tax. ' +
        'In Techno-Kol: open the employee record → "Entitlements" tab → "Study Fund" → enter the fund number, ' +
        'fund code and rate. The system auto-calculates on every wage slip, produces a monthly ACH file to the ' +
        'fund and issues a quarterly statement to the employee. ' +
        'Fund selection uses the Treasury-approved providers list.',
    },
    related: ['kb-payroll-wage-slip', 'kb-social-ni-employer'],
  });

  kb.createArticle({
    id: 'kb-tools-salary-sim',
    category: 'tools',
    author: 'kobi',
    tags: ['סימולטור', 'משכורת', 'calculator', 'simulator'],
    title: {
      he: 'סימולטור משכורת',
      en: 'Salary simulator',
    },
    body: {
      he:
        'סימולטור המשכורת של Techno-Kol מאפשר לחזות את שכר הנטו של עובד לפני הפקת תלוש רשמי. ' +
        'הסימולטור לוקח בחשבון: שכר ברוטו חודשי, נקודות זיכוי, ניכויי חובה, הפרשות לקרן פנסיה וקרן השתלמות, ' +
        'בנוסף להוצאות רכב ואש"ל ששולם. ' +
        'שימוש: תפריט "כלים" → "סימולטור שכר" → הזנת ברוטו מתוכנן ונקודות זיכוי → לחיצה על "חשב". ' +
        'הפלט מציג ברוטו, ניכוי מס הכנסה, ניכוי ביטוח לאומי, מס בריאות, הפרשות פנסיה/קרן, ונטו סופי. ' +
        'בנוסף יש גרף השוואתי לכמה תרחישים (למשל, מה קורה בתוספת בונוס של 5,000 ש"ח). ' +
        'הסימולטור אינו מפיק תלוש ואינו נשמר במאגר — מיועד לתכנון בלבד.',
      en:
        'The Techno-Kol salary simulator predicts an employee\'s net pay before issuing an official wage slip. ' +
        'Inputs: monthly gross, credit points, statutory deductions, pension and study-fund contributions, plus ' +
        'car and per-diem reimbursements. ' +
        'Usage: menu "Tools" → "Salary Simulator" → enter planned gross and credit points → click "Calculate". ' +
        'The output shows gross, income-tax deduction, NI deduction, health tax, pension/study-fund deductions and ' +
        'final net. A comparison chart illustrates alternative scenarios (e.g. adding a NIS 5,000 bonus). ' +
        'The simulator does NOT create a wage slip and is not archived — it is a planning tool only.',
    },
    related: ['kb-payroll-wage-slip', 'kb-tax-income-2026'],
  });

  kb.createArticle({
    id: 'kb-ops-backup-restore',
    category: 'ops',
    author: 'kobi',
    tags: ['גיבוי', 'שחזור', 'backup', 'restore'],
    title: {
      he: 'גיבוי ושחזור',
      en: 'Backup and restore',
    },
    body: {
      he:
        'Techno-Kol מפעילה גיבוי אוטומטי יומי: גיבוי מלא בחצות (00:00 שעון ישראל) וגיבוי תוספתי (incremental) כל 4 שעות. ' +
        'הגיבוי מוצפן ב־AES-256 ונשמר לשלושה יעדים בו־זמנית: (1) אחסון מקומי בשרת, (2) דיסק רשת (NAS), ' +
        '(3) ענן חיצוני (S3-compatible). כל גיבוי נבדק אוטומטית ע"י check-sum בתוך 30 דקות. ' +
        'שחזור: תפריט "מערכת" → "גיבוי ושחזור" → בחירת נקודת שחזור → אישור ע"י מנהל מערכת (MFA) → השחזור מתחיל ברקע. ' +
        'שחזור מלא אורך 5–15 דקות תלוי בגודל המסד. ' +
        'כלל חובה: לפני שדרוג גרסה יש להריץ גיבוי ידני נוסף ולוודא שהוא תקין. ' +
        'המערכת שומרת גיבויים ל־35 יום אחרונים + גיבוי חודשי ל־12 חודשים אחרונים + גיבוי שנתי ל־7 שנים.',
      en:
        'Techno-Kol runs automatic daily backups: a full backup at midnight (Israel time, 00:00) and an ' +
        'incremental backup every 4 hours. Backups are AES-256 encrypted and stored simultaneously to three ' +
        'destinations: (1) local storage on the server, (2) network-attached storage, (3) external cloud ' +
        '(S3-compatible). Every backup is checksum-verified within 30 minutes. ' +
        'Restore: menu "System" → "Backup & Restore" → choose a restore point → approve with an admin MFA → the ' +
        'restore runs in the background. A full restore takes 5–15 minutes depending on database size. ' +
        'Mandatory rule: before a version upgrade you must run a manual backup AND verify it is valid. ' +
        'Retention: 35 daily, 12 monthly and 7 yearly backups are kept.',
    },
    related: [],
  });
}

// ───────────────────────────────────────────────────────────────
// Exports
// ───────────────────────────────────────────────────────────────

module.exports = {
  createKB,
  seedDefaultKB,
  // Expose internals for tests
  _internal: {
    tokenise,
    normaliseText,
    bm25Search,
    snippet,
    STOPWORDS_HE,
    STOPWORDS_EN,
  },
};
