/**
 * AI SUMMARIZER — Pluggable-Backend NLU Engine
 * ──────────────────────────────────────────────
 * Techno-Kol Uzi mega-ERP / Swarm 3 / Agent X-17
 *
 * A zero-dependency, Hebrew-aware, fail-open abstraction over multiple LLM
 * providers. The module exposes a stable public API regardless of which
 * backend is active and gracefully falls back to a deterministic heuristic
 * ("local-stub") whenever a remote backend is absent, misconfigured, or
 * unreachable.
 *
 * ─────────────────────────  PUBLIC API  ─────────────────────────
 *   summarize(text, options)         → {summary, bullet_points[], language,
 *                                        tokens_used, backend, confidence}
 *   extractEntities(text)            → {people[], companies[], amounts[],
 *                                        dates[], locations[]}
 *   classify(text, categories[])     → {category, confidence}
 *   translate(text, target_lang)     → translated
 *   suggestReply(thread, context)    → reply draft
 *   createSummarizer(config)         → factory returning a Summarizer instance
 *
 * ─────────────────────────  BACKENDS  ───────────────────────────
 *   1. local-stub   — deterministic heuristic (default, always available)
 *   2. openai       — POST /v1/chat/completions  (OPENAI_API_KEY)
 *   3. anthropic    — POST /v1/messages          (ANTHROPIC_API_KEY)
 *   4. ollama       — POST localhost:11434/api/generate
 *   5. azure-openai — uses AZURE_OPENAI_KEY + AZURE_OPENAI_ENDPOINT
 *
 * ─────────────────────────  RULES  ──────────────────────────────
 *   • Never throw on missing/invalid keys — silently fall back to local-stub.
 *   • Hebrew bilingual: Hebrew input → Hebrew output whenever possible.
 *   • Zero runtime dependencies. Real HTTP via Node 18+ global `fetch`.
 *   • In-memory LRU cache keyed by content-hash (24h TTL).
 *   • Pluggable: callers inject a backend via `createSummarizer({backend})`.
 *   • Fail-open: every public method returns a sensible value, never throws.
 */

'use strict';

const crypto = require('node:crypto');

// ════════════════════════════════════════════════════════════════
// 1. CONSTANTS
// ════════════════════════════════════════════════════════════════

const BACKENDS = Object.freeze({
  LOCAL_STUB:   'local-stub',
  OPENAI:       'openai',
  ANTHROPIC:    'anthropic',
  OLLAMA:       'ollama',
  AZURE_OPENAI: 'azure-openai',
});

const DEFAULT_BACKEND        = BACKENDS.LOCAL_STUB;
const DEFAULT_CACHE_MAX      = 256;
const DEFAULT_CACHE_TTL_MS   = 24 * 60 * 60 * 1000; // 24h
const DEFAULT_TIMEOUT_MS     = 30_000;
const DEFAULT_MAX_BULLETS    = 5;
const DEFAULT_SUMMARY_RATIO  = 0.35; // summary ≈ 35% of source length
const DEFAULT_MODEL_OPENAI   = 'gpt-4o-mini';
const DEFAULT_MODEL_ANTHROPIC = 'claude-3-5-sonnet-20241022';
const DEFAULT_MODEL_OLLAMA   = 'llama3';

// Hebrew Unicode block: U+0590–U+05FF (and Yiddish / rare extensions).
const HEBREW_REGEX = /[\u0590-\u05FF\uFB1D-\uFB4F]/;
const BIDI_ISOLATE_LTR = '\u2066'; // LRI
const BIDI_ISOLATE_RTL = '\u2067'; // RLI
const BIDI_POP        = '\u2069'; // PDI

// Sentence terminators that work for Hebrew + English + mixed content.
// Hebrew itself uses ‘.’, ‘!’, ‘?’ so no special chars beyond these + newline.
const SENTENCE_SPLIT_REGEX = /(?<=[.!?؟])\s+|\n+/u;

// Very common Hebrew stop-words — used for keyword scoring in the stub.
const HEBREW_STOPWORDS = new Set([
  'של','את','על','עם','גם','אם','כי','זה','זו','זאת','היא','הוא','הם','הן',
  'אני','אתה','את','אנחנו','אתם','אתן','להיות','יש','אין','לא','כן','רק',
  'כל','כמו','בין','אל','לי','לך','לו','לה','להם','להן','מן','מה','מי',
  'איך','איפה','למה','מתי','כמה','אבל','או','אבל','אז','כש','בגלל','בכל',
  'עד','אחרי','לפני','תחת','מעל','מאד','מאוד','יותר','פחות','עוד','כבר',
  'אנו','הזה','הזאת','ההוא','ההיא','ההם','ההן','נגד','דרך','בשביל','עבור',
]);

const ENGLISH_STOPWORDS = new Set([
  'the','a','an','and','or','but','is','are','was','were','be','been','being',
  'of','in','on','at','to','for','with','by','from','as','this','that','these',
  'those','it','its','he','she','they','them','we','us','you','your','our',
  'i','me','my','not','no','yes','do','does','did','has','have','had','can',
  'could','should','would','will','shall','may','might','must','about','into',
  'over','under','between','through','during','before','after','against','so',
]);

// ════════════════════════════════════════════════════════════════
// 2. LRU CACHE  (in-memory, TTL-aware, no deps)
// ════════════════════════════════════════════════════════════════

/**
 * LruCache — tiny Map-backed LRU with absolute TTL per entry.
 * Map preserves insertion order → cheap LRU eviction.
 */
class LruCache {
  constructor(max = DEFAULT_CACHE_MAX, ttlMs = DEFAULT_CACHE_TTL_MS) {
    this.max = Math.max(1, max | 0);
    this.ttlMs = Math.max(1, ttlMs | 0);
    this.map = new Map();
  }
  _now() { return Date.now(); }
  get(key) {
    const entry = this.map.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= this._now()) {
      this.map.delete(key);
      return undefined;
    }
    // LRU touch: delete + set promotes to newest.
    this.map.delete(key);
    this.map.set(key, entry);
    return entry.value;
  }
  set(key, value) {
    if (this.map.has(key)) this.map.delete(key);
    this.map.set(key, { value, expiresAt: this._now() + this.ttlMs });
    while (this.map.size > this.max) {
      const oldest = this.map.keys().next().value;
      this.map.delete(oldest);
    }
  }
  has(key) {
    const entry = this.map.get(key);
    if (!entry) return false;
    if (entry.expiresAt <= this._now()) {
      this.map.delete(key);
      return false;
    }
    return true;
  }
  clear() { this.map.clear(); }
  get size() { return this.map.size; }
}

// ════════════════════════════════════════════════════════════════
// 3. HELPERS — language detection, normalization, hashing, bidi
// ════════════════════════════════════════════════════════════════

/**
 * hashContent — deterministic SHA-256 content hash used for cache keys.
 * Accepts any JSON-serializable payload.
 */
function hashContent(payload) {
  const str = typeof payload === 'string' ? payload : safeJsonStringify(payload);
  return crypto.createHash('sha256').update(str).digest('hex');
}

function safeJsonStringify(obj) {
  try { return JSON.stringify(obj); } catch (_) { return String(obj); }
}

/**
 * detectLanguage — returns 'he' | 'en' | 'mixed'.
 *   • he    → >= 70% Hebrew letters among alphabetic chars
 *   • en    → 0 Hebrew letters at all
 *   • mixed → everything in between
 */
function detectLanguage(text) {
  if (!text || typeof text !== 'string') return 'en';
  let heb = 0, lat = 0;
  for (const ch of text) {
    if (HEBREW_REGEX.test(ch)) heb++;
    else if (/[a-zA-Z]/.test(ch)) lat++;
  }
  if (heb === 0 && lat === 0) return 'en';
  if (heb === 0) return 'en';
  if (lat === 0) return 'he';
  const ratio = heb / (heb + lat);
  if (ratio >= 0.70) return 'he';
  if (ratio <= 0.10) return 'en';
  return 'mixed';
}

/** Wrap output with bidi isolates so it renders correctly in mixed UIs. */
function bidiSafe(text, language) {
  if (!text) return text;
  const marker = language === 'he' ? BIDI_ISOLATE_RTL : BIDI_ISOLATE_LTR;
  return `${marker}${text}${BIDI_POP}`;
}

/** Strip bidi isolates so we don't double-wrap cached values. */
function stripBidi(text) {
  if (!text) return text;
  return text
    .replace(new RegExp(BIDI_ISOLATE_LTR, 'g'), '')
    .replace(new RegExp(BIDI_ISOLATE_RTL, 'g'), '')
    .replace(new RegExp(BIDI_POP, 'g'), '');
}

function normalizeWhitespace(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

function splitSentences(text) {
  const clean = normalizeWhitespace(text);
  if (!clean) return [];
  return clean.split(SENTENCE_SPLIT_REGEX)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function tokenize(text) {
  return String(text || '')
    .toLowerCase()
    .split(/[\s.,;:!?"'״׳(){}\[\]<>\/\\|~`@#$%^&*+=\-_]+/u)
    .filter((t) => t.length > 0);
}

function isStopword(token) {
  return HEBREW_STOPWORDS.has(token) || ENGLISH_STOPWORDS.has(token);
}

function approxTokenCount(text) {
  // Very rough heuristic: ~4 chars per token in English, ~3 in Hebrew.
  if (!text) return 0;
  return Math.max(1, Math.ceil(text.length / 3.5));
}

// ════════════════════════════════════════════════════════════════
// 4. LOCAL-STUB BACKEND  (deterministic, always available)
// ════════════════════════════════════════════════════════════════

const localStubBackend = {
  name: BACKENDS.LOCAL_STUB,
  available: () => true,

  async summarize(text, options = {}) {
    const language    = detectLanguage(text);
    const maxBullets  = options.max_bullets || DEFAULT_MAX_BULLETS;
    const sentences   = splitSentences(text);
    if (sentences.length === 0) {
      return {
        summary: '',
        bullet_points: [],
        language,
        tokens_used: 0,
        backend: BACKENDS.LOCAL_STUB,
        confidence: 0.0,
      };
    }

    // ── Score each sentence by keyword density + position bonus.
    const keywordFreq = Object.create(null);
    for (const tok of tokenize(text)) {
      if (isStopword(tok)) continue;
      if (tok.length < 2) continue;
      keywordFreq[tok] = (keywordFreq[tok] || 0) + 1;
    }
    const topKeywords = Object.entries(keywordFreq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([word, freq]) => ({ word, freq }));

    const scored = sentences.map((s, i) => {
      const toks = tokenize(s);
      let score = 0;
      for (const t of toks) if (keywordFreq[t]) score += keywordFreq[t];
      // Lead bias: first two sentences get a boost.
      if (i === 0) score *= 1.6;
      else if (i === 1) score *= 1.25;
      // Length penalty for extreme outliers.
      if (toks.length < 3) score *= 0.5;
      if (toks.length > 50) score *= 0.7;
      return { sentence: s, score, index: i, len: toks.length };
    });

    // Summary = highest-scored sentences in original order, capped by ratio.
    const targetCount = Math.max(
      1,
      Math.min(
        sentences.length,
        Math.round(sentences.length * DEFAULT_SUMMARY_RATIO),
      ),
    );
    const summarySentences = [...scored]
      .sort((a, b) => b.score - a.score)
      .slice(0, targetCount)
      .sort((a, b) => a.index - b.index)
      .map((x) => x.sentence);

    // Bullet points = top sentences (distinct, trimmed), capped by maxBullets.
    const bullets = [...scored]
      .sort((a, b) => b.score - a.score)
      .slice(0, maxBullets)
      .sort((a, b) => a.index - b.index)
      .map((x) => trimToBullet(x.sentence, language));

    const summary = summarySentences.join(' ');
    const confidence = scored.length > 0
      ? Math.min(0.85, 0.30 + topKeywords.length / 40)
      : 0.0;

    return {
      summary,
      bullet_points: bullets,
      language,
      tokens_used: approxTokenCount(text),
      backend: BACKENDS.LOCAL_STUB,
      confidence: Number(confidence.toFixed(3)),
      keywords: topKeywords.slice(0, 10).map((k) => k.word),
    };
  },

  async extractEntities(text) {
    return extractEntitiesHeuristic(text);
  },

  async classify(text, categories) {
    return classifyHeuristic(text, categories);
  },

  async translate(text, targetLang) {
    // No real translation in stub. Return input with a language marker so
    // callers can see it's an un-translated echo (bidi-safe).
    const srcLang = detectLanguage(text);
    const safeSrc = stripBidi(String(text || ''));
    return {
      translated: safeSrc,
      source_language: srcLang,
      target_language: targetLang || 'en',
      backend: BACKENDS.LOCAL_STUB,
      note: 'local-stub: no real translation, echo only',
    };
  },

  async suggestReply(thread, context = {}) {
    const lang = detectLanguage(stringifyThread(thread));
    const templates = {
      he: [
        'שלום, תודה על פנייתך. קיבלנו את ההודעה ונחזור אליך בהקדם.',
        'תודה רבה על העדכון. נבחן את הפרטים ונחזור אליך עם תשובה מלאה.',
        'שלום, הבקשה התקבלה. אנחנו מטפלים בנושא ונעדכן אותך בקרוב.',
      ],
      en: [
        'Hello, thank you for reaching out. We received your message and will get back to you shortly.',
        'Thanks for the update. We are reviewing the details and will follow up with a full response.',
        'Hello, your request has been logged. We are working on it and will update you soon.',
      ],
    };
    const pool = lang === 'he' ? templates.he : templates.en;
    // Deterministic pick by thread hash → same thread always gets same reply.
    const idx = parseInt(hashContent(stringifyThread(thread)).slice(0, 8), 16) % pool.length;
    const base = pool[idx];

    // Prepend context subject if available.
    const subject = context && context.subject ? `[${context.subject}] ` : '';
    return {
      reply: subject + base,
      language: lang,
      backend: BACKENDS.LOCAL_STUB,
      confidence: 0.5,
    };
  },
};

/** Trim a sentence into a readable bullet — cut overly-long tails gracefully. */
function trimToBullet(sentence, language) {
  const s = normalizeWhitespace(sentence);
  const MAX = 160;
  if (s.length <= MAX) return s;
  const cut = s.slice(0, MAX);
  const lastSpace = cut.lastIndexOf(' ');
  const suffix = language === 'he' ? '…' : '…';
  return (lastSpace > 0 ? cut.slice(0, lastSpace) : cut) + suffix;
}

function stringifyThread(thread) {
  if (!thread) return '';
  if (typeof thread === 'string') return thread;
  if (Array.isArray(thread)) {
    return thread.map((m) => {
      if (!m) return '';
      if (typeof m === 'string') return m;
      return `${m.from || ''}: ${m.text || m.body || m.content || ''}`;
    }).join('\n');
  }
  if (typeof thread === 'object') {
    return thread.text || thread.body || thread.content || safeJsonStringify(thread);
  }
  return String(thread);
}

// ════════════════════════════════════════════════════════════════
// 5. HEURISTIC EXTRACTORS — used by local-stub AND as fallback
// ════════════════════════════════════════════════════════════════

/**
 * extractEntitiesHeuristic — regex-based NER fallback for Hebrew + English.
 */
function extractEntitiesHeuristic(text) {
  if (!text || typeof text !== 'string') {
    return { people: [], companies: [], amounts: [], dates: [], locations: [] };
  }

  const clean = text;

  // Amounts: ILS ₪, NIS, $, €, £ + thousands separators.
  const amountRegex = /(?:₪|\$|€|£|ש["']?ח|ils|nis|usd|eur|gbp)\s?[+-]?\d{1,3}(?:[,.\s]\d{3})*(?:[.,]\d+)?|[+-]?\d{1,3}(?:[,.\s]\d{3})*(?:[.,]\d+)?\s?(?:₪|\$|€|£|ש["']?ח|ils|nis|usd|eur|gbp|שקל|שקלים|דולר|יורו)/giu;
  const amounts = uniquePreserve(
    (clean.match(amountRegex) || []).map((a) => normalizeWhitespace(a)),
  );

  // Dates: 01/02/2026 • 2026-02-01 • 1.2.2026 • Hebrew "ב-3 בפברואר 2026"
  const dateRegex = /\b(?:\d{1,2}[./-]\d{1,2}[./-]\d{2,4}|\d{4}[./-]\d{1,2}[./-]\d{1,2})\b|ב[- ]?\d{1,2}\s?ב?(?:ינואר|פברואר|מרץ|אפריל|מאי|יוני|יולי|אוגוסט|ספטמבר|אוקטובר|נובמבר|דצמבר)\s?\d{2,4}?/gu;
  const dates = uniquePreserve(clean.match(dateRegex) || []);

  // Companies: tokens ending with Ltd / Inc / GmbH / בע״מ / בע"מ / שותפות.
  const companyRegex = /(?:[A-Z][A-Za-z0-9&.-]*(?:\s[A-Z][A-Za-z0-9&.-]*){0,4}\s(?:Ltd|Inc|LLC|LLP|GmbH|Corp|Co\.?)|[\u0590-\u05FF]+(?:\s[\u0590-\u05FF]+){0,4}\sבע["״']?מ)/gu;
  const companies = uniquePreserve(clean.match(companyRegex) || []);

  // People: "שם משפחה" capital-case English, 2-3 tokens, or Hebrew courtesy titles.
  // English: two capitalized words in a row.
  const enPeopleRegex = /\b[A-Z][a-z]+\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?\b/g;
  // Hebrew: מר / גב' / ד"ר / פרופ' followed by 1-3 Hebrew tokens.
  const hePeopleRegex = /(?:מר|גב['׳]?|ד["״']?ר|פרופ['׳]?)\s[\u0590-\u05FF]+(?:\s[\u0590-\u05FF]+){0,2}/gu;
  const people = uniquePreserve([
    ...(clean.match(enPeopleRegex) || []),
    ...(clean.match(hePeopleRegex) || []),
  ]);

  // Locations: rough "in <city>" / "ב-<city>" / known Israeli cities.
  const knownCities = [
    'תל אביב','ירושלים','חיפה','באר שבע','אשדוד','נתניה','ראשון לציון',
    'פתח תקווה','רמת גן','הרצליה','כפר סבא','נצרת','אילת','עכו','טבריה',
    'Tel Aviv','Jerusalem','Haifa','Beer Sheva','Ashdod','Netanya','Herzliya',
    'New York','London','Berlin','Paris','Dubai',
  ];
  const locations = [];
  for (const city of knownCities) {
    if (clean.includes(city) && !locations.includes(city)) locations.push(city);
  }

  return { people, companies, amounts, dates, locations };
}

function uniquePreserve(arr) {
  const seen = new Set();
  const out = [];
  for (const x of arr) {
    const key = String(x).trim();
    if (!key) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  return out;
}

/**
 * classifyHeuristic — keyword-match scoring for a short list of categories.
 * `categories` can be either strings or {name, keywords:[]} objects.
 *
 * When a caller passes bare string names that match a canonical default
 * (e.g. 'invoice', 'complaint'), we enrich the keyword list with the
 * bilingual Hebrew+English defaults so Hebrew text still classifies correctly.
 */
const DEFAULT_CATEGORY_KEYWORDS = {
  invoice:   ['חשבונית','invoice','bill','סכום','total','vat','מע"מ','מעמ'],
  payment:   ['תשלום','payment','paid','shalem','העברה','transfer','שילמתי','שילם'],
  complaint: ['תלונה','complaint','issue','בעיה','מאוכזב','refund','החזר','לא מרוצה','מאוכזבת'],
  inquiry:   ['שאלה','question','inquiry','ברר','clarify','info','מידע','לשאול'],
  contract:  ['חוזה','contract','agreement','הסכם','terms','תנאים'],
  other:     [],
};

function classifyHeuristic(text, categories) {
  const defaultCats = Object.keys(DEFAULT_CATEGORY_KEYWORDS).map((name) => ({
    name,
    keywords: DEFAULT_CATEGORY_KEYWORDS[name],
  }));

  let cats;
  if (!Array.isArray(categories) || categories.length === 0) {
    cats = defaultCats;
  } else {
    cats = categories
      .filter((c) => c != null)
      .map((c) => {
        if (typeof c === 'string') {
          const key = c.toLowerCase();
          const kws = DEFAULT_CATEGORY_KEYWORDS[key];
          return { name: c, keywords: Array.isArray(kws) && kws.length ? kws : [c] };
        }
        if (typeof c === 'object') {
          const name = (c && c.name) || 'unknown';
          const kws  = (c && Array.isArray(c.keywords)) ? c.keywords : null;
          if (kws && kws.length) return { name, keywords: kws };
          const fallback = DEFAULT_CATEGORY_KEYWORDS[String(name).toLowerCase()];
          return { name, keywords: fallback && fallback.length ? fallback : [name] };
        }
        return { name: String(c), keywords: [String(c)] };
      });
    if (cats.length === 0) cats = defaultCats;
  }

  const tokens = new Set(tokenize(text));
  const lowerText = String(text || '').toLowerCase();
  let best = { category: cats[cats.length - 1].name || 'other', score: 0 };
  for (const cat of cats) {
    let score = 0;
    for (const kw of (cat.keywords || [])) {
      const k = String(kw || '').toLowerCase();
      if (!k) continue;
      if (tokens.has(k)) score += 2;
      else if (lowerText.includes(k)) score += 1;
    }
    if (score > best.score) best = { category: cat.name, score };
  }
  // Confidence: squash to [0,1].
  const confidence = best.score === 0 ? 0.1 : Math.min(0.95, 0.3 + best.score * 0.15);
  return { category: best.category, confidence: Number(confidence.toFixed(3)) };
}

// ════════════════════════════════════════════════════════════════
// 6. REMOTE BACKENDS  (OpenAI / Anthropic / Ollama / Azure)
// ════════════════════════════════════════════════════════════════

/** Shared fetch wrapper: abortable, fail-open (returns null on any error). */
async function safeFetch(url, init, timeoutMs, log) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await (globalThis.fetch || (() => { throw new Error('fetch unavailable'); }))(
      url,
      { ...init, signal: controller.signal },
    );
    clearTimeout(timer);
    if (!res || !res.ok) {
      log('remote.non_ok', { url, status: res && res.status });
      return null;
    }
    const text = await res.text();
    try { return text ? JSON.parse(text) : null; }
    catch (_) { return { raw: text }; }
  } catch (err) {
    clearTimeout(timer);
    log('remote.error', { url, error: err && err.message });
    return null;
  }
}

function buildSummarizePrompt(text, language, maxBullets) {
  const heInstructions = [
    'אתה עוזר תמצות מקצועי.',
    'סכם את הטקסט הבא בעברית.',
    `החזר JSON תקין בלבד במבנה: {"summary": "...", "bullet_points": ["...", ...], "keywords": ["...", ...]}`,
    `עד ${maxBullets} נקודות עיקריות.`,
  ].join(' ');
  const enInstructions = [
    'You are a professional summarization assistant.',
    'Summarize the following text concisely.',
    `Return ONLY valid JSON with schema: {"summary": "...", "bullet_points": ["...", ...], "keywords": ["...", ...]}`,
    `At most ${maxBullets} bullet points.`,
  ].join(' ');
  const instr = language === 'he' ? heInstructions : enInstructions;
  return `${instr}\n\n---\n${text}\n---`;
}

function parseModelJson(s) {
  if (!s || typeof s !== 'string') return null;
  // Extract first {...} blob — tolerant of markdown fences / chatter.
  const match = s.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try { return JSON.parse(match[0]); } catch (_) { return null; }
}

// ── OpenAI ──────────────────────────────────────────────────────
const openaiBackend = {
  name: BACKENDS.OPENAI,
  available() { return !!process.env.OPENAI_API_KEY; },

  async summarize(text, options = {}, cfg = {}) {
    if (!this.available()) return null;
    const language   = detectLanguage(text);
    const maxBullets = options.max_bullets || DEFAULT_MAX_BULLETS;
    const model      = cfg.model || process.env.OPENAI_MODEL || DEFAULT_MODEL_OPENAI;
    const endpoint   = (cfg.endpoint || 'https://api.openai.com') + '/v1/chat/completions';
    const body = {
      model,
      messages: [
        { role: 'system', content: language === 'he'
            ? 'אתה עוזר AI שמתמחה בתמצות ובניתוח טקסטים בעברית ואנגלית. החזר תמיד JSON תקין.'
            : 'You are an AI assistant specialized in summarization. Always return valid JSON.' },
        { role: 'user',   content: buildSummarizePrompt(text, language, maxBullets) },
      ],
      temperature: 0.2,
      max_tokens: 800,
    };
    const data = await safeFetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify(body),
    }, cfg.timeoutMs || DEFAULT_TIMEOUT_MS, cfg.log || (() => {}));
    if (!data) return null;
    const content = data && data.choices && data.choices[0]
      && data.choices[0].message && data.choices[0].message.content;
    const parsed = parseModelJson(content) || {};
    const usage = data.usage || {};
    return {
      summary: parsed.summary || '',
      bullet_points: Array.isArray(parsed.bullet_points) ? parsed.bullet_points : [],
      language,
      tokens_used: usage.total_tokens || approxTokenCount(text),
      backend: BACKENDS.OPENAI,
      confidence: 0.88,
      keywords: Array.isArray(parsed.keywords) ? parsed.keywords : [],
    };
  },

  async extractEntities(text, cfg = {}) {
    if (!this.available()) return null;
    const model = cfg.model || process.env.OPENAI_MODEL || DEFAULT_MODEL_OPENAI;
    const endpoint = (cfg.endpoint || 'https://api.openai.com') + '/v1/chat/completions';
    const instr = 'Extract named entities. Return JSON: {"people":[],"companies":[],"amounts":[],"dates":[],"locations":[]}.';
    const data = await safeFetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: instr },
          { role: 'user',   content: text },
        ],
        temperature: 0.0,
      }),
    }, cfg.timeoutMs || DEFAULT_TIMEOUT_MS, cfg.log || (() => {}));
    if (!data) return null;
    const content = data && data.choices && data.choices[0]
      && data.choices[0].message && data.choices[0].message.content;
    const parsed = parseModelJson(content);
    if (!parsed) return null;
    return {
      people:    Array.isArray(parsed.people)    ? parsed.people    : [],
      companies: Array.isArray(parsed.companies) ? parsed.companies : [],
      amounts:   Array.isArray(parsed.amounts)   ? parsed.amounts   : [],
      dates:     Array.isArray(parsed.dates)     ? parsed.dates     : [],
      locations: Array.isArray(parsed.locations) ? parsed.locations : [],
    };
  },

  async classify(text, categories, cfg = {}) {
    if (!this.available()) return null;
    const model = cfg.model || process.env.OPENAI_MODEL || DEFAULT_MODEL_OPENAI;
    const endpoint = (cfg.endpoint || 'https://api.openai.com') + '/v1/chat/completions';
    const cats = Array.isArray(categories) ? categories : [];
    const instr = `Classify the following text into one of these categories: ${cats.join(', ') || 'invoice, payment, complaint, inquiry, contract, other'}. Return JSON: {"category":"...","confidence":0-1}.`;
    const data = await safeFetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: instr },
          { role: 'user',   content: text },
        ],
        temperature: 0.0,
      }),
    }, cfg.timeoutMs || DEFAULT_TIMEOUT_MS, cfg.log || (() => {}));
    if (!data) return null;
    const content = data && data.choices && data.choices[0]
      && data.choices[0].message && data.choices[0].message.content;
    const parsed = parseModelJson(content);
    if (!parsed || !parsed.category) return null;
    return {
      category: String(parsed.category),
      confidence: Number(parsed.confidence || 0.75),
    };
  },

  async translate(text, targetLang, cfg = {}) {
    if (!this.available()) return null;
    const model = cfg.model || process.env.OPENAI_MODEL || DEFAULT_MODEL_OPENAI;
    const endpoint = (cfg.endpoint || 'https://api.openai.com') + '/v1/chat/completions';
    const data = await safeFetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: `You are a translator. Translate the user's text to ${targetLang}. Output only the translation, no commentary.` },
          { role: 'user',   content: text },
        ],
        temperature: 0.1,
      }),
    }, cfg.timeoutMs || DEFAULT_TIMEOUT_MS, cfg.log || (() => {}));
    if (!data) return null;
    const content = data && data.choices && data.choices[0]
      && data.choices[0].message && data.choices[0].message.content;
    if (!content) return null;
    return {
      translated: String(content).trim(),
      source_language: detectLanguage(text),
      target_language: targetLang || 'en',
      backend: BACKENDS.OPENAI,
    };
  },

  async suggestReply(thread, context = {}, cfg = {}) {
    if (!this.available()) return null;
    const threadText = stringifyThread(thread);
    const lang = detectLanguage(threadText);
    const model = cfg.model || process.env.OPENAI_MODEL || DEFAULT_MODEL_OPENAI;
    const endpoint = (cfg.endpoint || 'https://api.openai.com') + '/v1/chat/completions';
    const sys = lang === 'he'
      ? 'אתה עוזר המנסח תשובות מקצועיות למיילים וצ\'אטים עסקיים. ענה בעברית בסגנון ידידותי ומקצועי.'
      : 'You draft professional replies for business emails and chats. Respond concisely and politely.';
    const data = await safeFetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: sys },
          { role: 'user',   content: `Thread:\n${threadText}\n\nContext: ${safeJsonStringify(context)}\n\nDraft a reply.` },
        ],
        temperature: 0.5,
      }),
    }, cfg.timeoutMs || DEFAULT_TIMEOUT_MS, cfg.log || (() => {}));
    if (!data) return null;
    const content = data && data.choices && data.choices[0]
      && data.choices[0].message && data.choices[0].message.content;
    if (!content) return null;
    return {
      reply: String(content).trim(),
      language: lang,
      backend: BACKENDS.OPENAI,
      confidence: 0.85,
    };
  },
};

// ── Anthropic ───────────────────────────────────────────────────
const anthropicBackend = {
  name: BACKENDS.ANTHROPIC,
  available() { return !!process.env.ANTHROPIC_API_KEY; },

  async _call(prompt, cfg = {}) {
    const model    = cfg.model || process.env.ANTHROPIC_MODEL || DEFAULT_MODEL_ANTHROPIC;
    const endpoint = (cfg.endpoint || 'https://api.anthropic.com') + '/v1/messages';
    return safeFetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }],
      }),
    }, cfg.timeoutMs || DEFAULT_TIMEOUT_MS, cfg.log || (() => {}));
  },

  _extractText(data) {
    if (!data || !Array.isArray(data.content)) return '';
    return data.content.map((c) => c && c.text ? c.text : '').join('\n').trim();
  },

  async summarize(text, options = {}, cfg = {}) {
    if (!this.available()) return null;
    const language   = detectLanguage(text);
    const maxBullets = options.max_bullets || DEFAULT_MAX_BULLETS;
    const data = await this._call(buildSummarizePrompt(text, language, maxBullets), cfg);
    if (!data) return null;
    const parsed = parseModelJson(this._extractText(data)) || {};
    const usage = data.usage || {};
    return {
      summary: parsed.summary || '',
      bullet_points: Array.isArray(parsed.bullet_points) ? parsed.bullet_points : [],
      language,
      tokens_used: (usage.input_tokens || 0) + (usage.output_tokens || 0) || approxTokenCount(text),
      backend: BACKENDS.ANTHROPIC,
      confidence: 0.9,
      keywords: Array.isArray(parsed.keywords) ? parsed.keywords : [],
    };
  },

  async extractEntities(text, cfg = {}) {
    if (!this.available()) return null;
    const prompt = `Extract named entities from the text below. Return ONLY valid JSON with this schema: {"people":[],"companies":[],"amounts":[],"dates":[],"locations":[]}. Text:\n${text}`;
    const data = await this._call(prompt, cfg);
    if (!data) return null;
    const parsed = parseModelJson(this._extractText(data));
    if (!parsed) return null;
    return {
      people:    Array.isArray(parsed.people)    ? parsed.people    : [],
      companies: Array.isArray(parsed.companies) ? parsed.companies : [],
      amounts:   Array.isArray(parsed.amounts)   ? parsed.amounts   : [],
      dates:     Array.isArray(parsed.dates)     ? parsed.dates     : [],
      locations: Array.isArray(parsed.locations) ? parsed.locations : [],
    };
  },

  async classify(text, categories, cfg = {}) {
    if (!this.available()) return null;
    const cats = Array.isArray(categories) ? categories.join(', ') : 'invoice, payment, complaint, inquiry, contract, other';
    const prompt = `Classify the following text into one of: ${cats}. Return ONLY valid JSON: {"category":"...","confidence":0-1}.\n\n${text}`;
    const data = await this._call(prompt, cfg);
    if (!data) return null;
    const parsed = parseModelJson(this._extractText(data));
    if (!parsed || !parsed.category) return null;
    return { category: String(parsed.category), confidence: Number(parsed.confidence || 0.8) };
  },

  async translate(text, targetLang, cfg = {}) {
    if (!this.available()) return null;
    const prompt = `Translate the following text to ${targetLang}. Output only the translation.\n\n${text}`;
    const data = await this._call(prompt, cfg);
    if (!data) return null;
    const content = this._extractText(data);
    if (!content) return null;
    return {
      translated: content,
      source_language: detectLanguage(text),
      target_language: targetLang || 'en',
      backend: BACKENDS.ANTHROPIC,
    };
  },

  async suggestReply(thread, context = {}, cfg = {}) {
    if (!this.available()) return null;
    const threadText = stringifyThread(thread);
    const lang = detectLanguage(threadText);
    const langInstr = lang === 'he' ? 'השב בעברית.' : 'Respond in English.';
    const prompt = `Draft a professional, concise reply. ${langInstr}\n\nThread:\n${threadText}\n\nContext: ${safeJsonStringify(context)}`;
    const data = await this._call(prompt, cfg);
    if (!data) return null;
    const content = this._extractText(data);
    if (!content) return null;
    return {
      reply: content,
      language: lang,
      backend: BACKENDS.ANTHROPIC,
      confidence: 0.9,
    };
  },
};

// ── Ollama ──────────────────────────────────────────────────────
const ollamaBackend = {
  name: BACKENDS.OLLAMA,
  available() { return true; /* local server — probe at call time */ },

  async _call(prompt, cfg = {}) {
    const model    = cfg.model || process.env.OLLAMA_MODEL || DEFAULT_MODEL_OLLAMA;
    const endpoint = (cfg.endpoint || process.env.OLLAMA_URL || 'http://localhost:11434') + '/api/generate';
    return safeFetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, prompt, stream: false }),
    }, cfg.timeoutMs || DEFAULT_TIMEOUT_MS, cfg.log || (() => {}));
  },

  async summarize(text, options = {}, cfg = {}) {
    const language = detectLanguage(text);
    const data = await this._call(
      buildSummarizePrompt(text, language, options.max_bullets || DEFAULT_MAX_BULLETS),
      cfg,
    );
    if (!data) return null;
    const parsed = parseModelJson(data.response || '') || {};
    return {
      summary: parsed.summary || '',
      bullet_points: Array.isArray(parsed.bullet_points) ? parsed.bullet_points : [],
      language,
      tokens_used: approxTokenCount(text),
      backend: BACKENDS.OLLAMA,
      confidence: 0.8,
      keywords: Array.isArray(parsed.keywords) ? parsed.keywords : [],
    };
  },

  async extractEntities(text, cfg = {}) {
    const data = await this._call(
      `Extract entities. Return JSON {"people":[],"companies":[],"amounts":[],"dates":[],"locations":[]}:\n${text}`,
      cfg,
    );
    if (!data) return null;
    const parsed = parseModelJson(data.response || '');
    if (!parsed) return null;
    return {
      people:    parsed.people    || [],
      companies: parsed.companies || [],
      amounts:   parsed.amounts   || [],
      dates:     parsed.dates     || [],
      locations: parsed.locations || [],
    };
  },

  async classify(text, categories, cfg = {}) {
    const cats = Array.isArray(categories) ? categories.join(', ') : 'other';
    const data = await this._call(
      `Classify into one of [${cats}]. Return JSON {"category":"...","confidence":0-1}:\n${text}`,
      cfg,
    );
    if (!data) return null;
    const parsed = parseModelJson(data.response || '');
    if (!parsed || !parsed.category) return null;
    return { category: parsed.category, confidence: Number(parsed.confidence || 0.7) };
  },

  async translate(text, targetLang, cfg = {}) {
    const data = await this._call(
      `Translate to ${targetLang}. Return only the translation:\n${text}`,
      cfg,
    );
    if (!data || !data.response) return null;
    return {
      translated: String(data.response).trim(),
      source_language: detectLanguage(text),
      target_language: targetLang || 'en',
      backend: BACKENDS.OLLAMA,
    };
  },

  async suggestReply(thread, context = {}, cfg = {}) {
    const threadText = stringifyThread(thread);
    const lang = detectLanguage(threadText);
    const data = await this._call(
      `Draft a professional reply (${lang}).\nThread:\n${threadText}\nContext: ${safeJsonStringify(context)}`,
      cfg,
    );
    if (!data || !data.response) return null;
    return {
      reply: String(data.response).trim(),
      language: lang,
      backend: BACKENDS.OLLAMA,
      confidence: 0.75,
    };
  },
};

// ── Azure OpenAI ────────────────────────────────────────────────
const azureOpenaiBackend = {
  name: BACKENDS.AZURE_OPENAI,
  available() {
    return !!(process.env.AZURE_OPENAI_KEY && process.env.AZURE_OPENAI_ENDPOINT);
  },

  _buildUrl(cfg) {
    const endpoint = (cfg.endpoint || process.env.AZURE_OPENAI_ENDPOINT || '').replace(/\/+$/, '');
    const deployment = cfg.deployment || process.env.AZURE_OPENAI_DEPLOYMENT || 'gpt-4o-mini';
    const version = cfg.apiVersion || process.env.AZURE_OPENAI_API_VERSION || '2024-06-01';
    return `${endpoint}/openai/deployments/${deployment}/chat/completions?api-version=${version}`;
  },

  async _chat(messages, cfg = {}) {
    if (!this.available()) return null;
    const url = this._buildUrl(cfg);
    return safeFetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key':      process.env.AZURE_OPENAI_KEY,
      },
      body: JSON.stringify({ messages, temperature: 0.2, max_tokens: 800 }),
    }, cfg.timeoutMs || DEFAULT_TIMEOUT_MS, cfg.log || (() => {}));
  },

  async summarize(text, options = {}, cfg = {}) {
    const language = detectLanguage(text);
    const data = await this._chat([
      { role: 'system', content: language === 'he'
          ? 'אתה עוזר תמצות. החזר תמיד JSON תקין.'
          : 'You are a summarization assistant. Always return valid JSON.' },
      { role: 'user',   content: buildSummarizePrompt(text, language, options.max_bullets || DEFAULT_MAX_BULLETS) },
    ], cfg);
    if (!data) return null;
    const content = data && data.choices && data.choices[0]
      && data.choices[0].message && data.choices[0].message.content;
    const parsed = parseModelJson(content) || {};
    return {
      summary: parsed.summary || '',
      bullet_points: Array.isArray(parsed.bullet_points) ? parsed.bullet_points : [],
      language,
      tokens_used: (data.usage && data.usage.total_tokens) || approxTokenCount(text),
      backend: BACKENDS.AZURE_OPENAI,
      confidence: 0.87,
      keywords: Array.isArray(parsed.keywords) ? parsed.keywords : [],
    };
  },

  async extractEntities(text, cfg = {}) {
    const data = await this._chat([
      { role: 'system', content: 'Extract entities. Return JSON {"people":[],"companies":[],"amounts":[],"dates":[],"locations":[]}.' },
      { role: 'user',   content: text },
    ], cfg);
    if (!data) return null;
    const content = data && data.choices && data.choices[0]
      && data.choices[0].message && data.choices[0].message.content;
    const parsed = parseModelJson(content);
    if (!parsed) return null;
    return {
      people:    parsed.people    || [],
      companies: parsed.companies || [],
      amounts:   parsed.amounts   || [],
      dates:     parsed.dates     || [],
      locations: parsed.locations || [],
    };
  },

  async classify(text, categories, cfg = {}) {
    const cats = Array.isArray(categories) ? categories.join(', ') : 'other';
    const data = await this._chat([
      { role: 'system', content: `Classify into one of: ${cats}. Return JSON {"category":"...","confidence":0-1}.` },
      { role: 'user',   content: text },
    ], cfg);
    if (!data) return null;
    const content = data && data.choices && data.choices[0]
      && data.choices[0].message && data.choices[0].message.content;
    const parsed = parseModelJson(content);
    if (!parsed || !parsed.category) return null;
    return { category: parsed.category, confidence: Number(parsed.confidence || 0.8) };
  },

  async translate(text, targetLang, cfg = {}) {
    const data = await this._chat([
      { role: 'system', content: `Translate to ${targetLang}. Output only the translation.` },
      { role: 'user',   content: text },
    ], cfg);
    if (!data) return null;
    const content = data && data.choices && data.choices[0]
      && data.choices[0].message && data.choices[0].message.content;
    if (!content) return null;
    return {
      translated: String(content).trim(),
      source_language: detectLanguage(text),
      target_language: targetLang || 'en',
      backend: BACKENDS.AZURE_OPENAI,
    };
  },

  async suggestReply(thread, context = {}, cfg = {}) {
    const threadText = stringifyThread(thread);
    const lang = detectLanguage(threadText);
    const data = await this._chat([
      { role: 'system', content: lang === 'he'
          ? 'נסח תשובה מקצועית וקצרה בעברית.'
          : 'Draft a concise professional reply.' },
      { role: 'user',   content: `Thread:\n${threadText}\nContext: ${safeJsonStringify(context)}` },
    ], cfg);
    if (!data) return null;
    const content = data && data.choices && data.choices[0]
      && data.choices[0].message && data.choices[0].message.content;
    if (!content) return null;
    return {
      reply: String(content).trim(),
      language: lang,
      backend: BACKENDS.AZURE_OPENAI,
      confidence: 0.85,
    };
  },
};

// ════════════════════════════════════════════════════════════════
// 7. BACKEND REGISTRY + RESOLVER
// ════════════════════════════════════════════════════════════════

const BACKEND_REGISTRY = {
  [BACKENDS.LOCAL_STUB]:   localStubBackend,
  [BACKENDS.OPENAI]:       openaiBackend,
  [BACKENDS.ANTHROPIC]:    anthropicBackend,
  [BACKENDS.OLLAMA]:       ollamaBackend,
  [BACKENDS.AZURE_OPENAI]: azureOpenaiBackend,
};

/**
 * resolveBackend — pick the requested backend or fall back to local-stub.
 * Never returns null — local-stub is always available.
 */
function resolveBackend(name) {
  const wanted = (name || process.env.AI_BACKEND || DEFAULT_BACKEND).toLowerCase();
  const chosen = BACKEND_REGISTRY[wanted];
  if (!chosen) return BACKEND_REGISTRY[BACKENDS.LOCAL_STUB];
  if (typeof chosen.available === 'function' && !chosen.available()) {
    return BACKEND_REGISTRY[BACKENDS.LOCAL_STUB];
  }
  return chosen;
}

// ════════════════════════════════════════════════════════════════
// 8. SUMMARIZER CLASS + FACTORY
// ════════════════════════════════════════════════════════════════

class Summarizer {
  constructor(config = {}) {
    this.backendName = config.backend || process.env.AI_BACKEND || DEFAULT_BACKEND;
    this.cache = new LruCache(
      config.cache_max || DEFAULT_CACHE_MAX,
      config.cache_ttl_ms || DEFAULT_CACHE_TTL_MS,
    );
    this.cacheEnabled = config.cache !== false;
    this.bidi = config.bidi !== false; // default on
    this.timeoutMs = config.timeout_ms || DEFAULT_TIMEOUT_MS;
    this.model = config.model;
    this.endpoint = config.endpoint;
    this.log = typeof config.log === 'function' ? config.log : () => {};
    this._backend = resolveBackend(this.backendName);
    this.deployment = config.deployment;
    this.apiVersion = config.api_version;
    this.fallbackToStub = config.fallback_to_stub !== false; // default on
  }

  /** Active backend name (after fallback). */
  get activeBackend() { return this._backend.name; }

  _key(op, payload) { return `${this.activeBackend}:${op}:${hashContent(payload)}`; }

  async _withCache(op, payload, compute) {
    if (!this.cacheEnabled) return compute();
    const key = this._key(op, payload);
    const hit = this.cache.get(key);
    if (hit !== undefined) return hit;
    const result = await compute();
    if (result !== undefined && result !== null) this.cache.set(key, result);
    return result;
  }

  _cfg() {
    return {
      model:      this.model,
      endpoint:   this.endpoint,
      timeoutMs:  this.timeoutMs,
      log:        this.log,
      deployment: this.deployment,
      apiVersion: this.apiVersion,
    };
  }

  async _callWithFallback(method, args) {
    try {
      const result = await this._backend[method](...args, this._cfg());
      if (result != null) return result;
    } catch (err) {
      this.log('backend.error', { backend: this._backend.name, method, error: err && err.message });
    }
    if (this.fallbackToStub && this._backend.name !== BACKENDS.LOCAL_STUB) {
      this.log('backend.fallback', { from: this._backend.name, to: BACKENDS.LOCAL_STUB });
      return localStubBackend[method](...args);
    }
    return localStubBackend[method](...args);
  }

  async summarize(text, options = {}) {
    const safeText = String(text == null ? '' : text);
    return this._withCache('summarize', { text: safeText, options }, async () => {
      const res = await this._callWithFallback('summarize', [safeText, options]);
      if (this.bidi && res && typeof res.summary === 'string') {
        res.summary_bidi = bidiSafe(stripBidi(res.summary), res.language);
      }
      return res;
    });
  }

  async extractEntities(text) {
    const safeText = String(text == null ? '' : text);
    return this._withCache('extractEntities', { text: safeText }, async () => {
      return this._callWithFallback('extractEntities', [safeText]);
    });
  }

  async classify(text, categories) {
    const safeText = String(text == null ? '' : text);
    const cats = Array.isArray(categories) ? categories : [];
    return this._withCache('classify', { text: safeText, categories: cats }, async () => {
      return this._callWithFallback('classify', [safeText, cats]);
    });
  }

  async translate(text, targetLang) {
    const safeText = String(text == null ? '' : text);
    const tgt = targetLang || 'en';
    return this._withCache('translate', { text: safeText, target: tgt }, async () => {
      return this._callWithFallback('translate', [safeText, tgt]);
    });
  }

  async suggestReply(thread, context = {}) {
    return this._withCache('suggestReply', { thread, context }, async () => {
      return this._callWithFallback('suggestReply', [thread, context]);
    });
  }

  clearCache() { this.cache.clear(); }
  cacheSize() { return this.cache.size; }
}

/**
 * createSummarizer — factory. Never throws. Returns a ready-to-use instance.
 */
function createSummarizer(config = {}) {
  return new Summarizer(config || {});
}

// ════════════════════════════════════════════════════════════════
// 9. MODULE-LEVEL DEFAULT INSTANCE + FUNCTIONAL EXPORTS
// ════════════════════════════════════════════════════════════════

let _defaultInstance = null;
function _getDefault() {
  if (!_defaultInstance) _defaultInstance = createSummarizer({});
  return _defaultInstance;
}
function _resetDefault() { _defaultInstance = null; }

async function summarize(text, options)           { return _getDefault().summarize(text, options); }
async function extractEntities(text)              { return _getDefault().extractEntities(text); }
async function classify(text, categories)         { return _getDefault().classify(text, categories); }
async function translate(text, targetLang)        { return _getDefault().translate(text, targetLang); }
async function suggestReply(thread, context)      { return _getDefault().suggestReply(thread, context); }

// ════════════════════════════════════════════════════════════════
// 10. EXPORTS
// ════════════════════════════════════════════════════════════════

module.exports = {
  // Factory + class
  createSummarizer,
  Summarizer,

  // Functional API (uses default instance)
  summarize,
  extractEntities,
  classify,
  translate,
  suggestReply,

  // Constants / helpers exposed for tests + diagnostics
  BACKENDS,
  detectLanguage,
  hashContent,
  LruCache,
  bidiSafe,
  stripBidi,
  splitSentences,
  tokenize,
  extractEntitiesHeuristic,
  classifyHeuristic,
  resolveBackend,
  _resetDefault,
  _backends: BACKEND_REGISTRY,
  _internal: {
    DEFAULT_BACKEND,
    DEFAULT_CACHE_MAX,
    DEFAULT_CACHE_TTL_MS,
    DEFAULT_MAX_BULLETS,
    DEFAULT_SUMMARY_RATIO,
    HEBREW_REGEX,
  },
};
