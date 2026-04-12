/**
 * Voice of Customer (VOC) — קול הלקוח
 * =============================================================
 *
 * Agent Y-101  |  Customer Experience  |  Techno-Kol Uzi mega-ERP
 *
 * Zero-dependency, in-memory VOC capture and aggregation engine.
 * Captures customer voice from many channels, normalizes, categorizes,
 * clusters themes, applies customer-weight voting, prioritizes and
 * links to the product roadmap, and closes the loop with customers
 * once work ships.
 *
 * Rule: לא מוחקים רק משדרגים ומגדלים  —  we never delete anything,
 * only upgrade and grow. All items, themes, votes, close-loop actions
 * and roadmap links are append-only; every update creates a new
 * revision and preserves the full history.
 *
 * No external libraries — only a pseudo-random deterministic id
 * generator. Fully bilingual (Hebrew + English). Hebrew sentiment
 * analysis is built on an embedded lexicon — no third-party NLP.
 *
 * -------------------------------------------------------------
 * DOMAIN MODEL
 * -------------------------------------------------------------
 *
 *   Item (captured customer voice) {
 *     id, source, customerId, content, sentiment,
 *     sentimentScore, polarity, language, date,
 *     author, tokens[], category?, themeId?,
 *     competitorsMentioned[], createdAt, revisions[]
 *   }
 *
 *   Theme (cluster of similar items) {
 *     id, label, labelHe, items[], centroid{token:weight},
 *     category, createdAt, status, priority, votes[],
 *     weightTotal, roadmapItemId?, closeLoop[]
 *   }
 *
 *   Vote (customer stacking weight on a theme) {
 *     id, themeId, customerId, weight, date
 *   }
 *
 *   CloseLoop (update communicated back to customers) {
 *     id, themeId, customerIds[], updateText, date
 *   }
 *
 *   Category enum:
 *     product-feedback | pricing | competition | support |
 *     feature-request  | bug     | compliment
 *
 * -------------------------------------------------------------
 * PUBLIC API (class VOC)
 * -------------------------------------------------------------
 *   captureItem({source, customerId, content, sentiment?, date?, author?})
 *                                                       → Item
 *   categorize({item, categories?})                     → Item
 *   themeExtraction(period?)                            → Theme[]
 *   voteOnTheme({themeId, customerId, weight})          → Vote
 *   prioritizeThemes({metric})                          → Theme[] sorted
 *   linkToRoadmap({themeId, roadmapItemId})             → Theme
 *   closeLoop({themeId, customerIds, updateText, date?}) → CloseLoop
 *   trendByCategory(period?)                            → object
 *   competitorMentions(period?)                         → array
 *   featureRequestTracker({customerId})                 → Item[]
 *   voiceShare({product?, period?})                    → object
 *   generateProductBrief(themeId)                       → object bilingual
 *
 *   Rule-of-thumb: every method either captures new data or returns
 *   an analytic view; nothing is destructive.
 * =============================================================
 */

'use strict';

// --------------------------------------------------------------------------
// deterministic id generator — zero deps, collision-safe per process
// --------------------------------------------------------------------------
let __seq = 0;
function mkId(prefix) {
  __seq += 1;
  const t = Date.now().toString(36);
  const s = __seq.toString(36).padStart(4, '0');
  const r = Math.floor(Math.random() * 1e6).toString(36).padStart(4, '0');
  return `${prefix}_${t}${s}${r}`;
}

// --------------------------------------------------------------------------
// Hebrew + English sentiment lexicon (embedded, no deps)
// positive > 0, negative < 0; magnitude signals intensity
// --------------------------------------------------------------------------
const SENTIMENT_LEXICON = {
  // --- Hebrew positive ---
  'מעולה': 2, 'מצוין': 2, 'נפלא': 2, 'פנטסטי': 2, 'אהבתי': 2,
  'מדהים': 2, 'מושלם': 2, 'יופי': 1, 'טוב': 1, 'נחמד': 1,
  'שמח': 1, 'מרוצה': 1.5, 'ממליץ': 1.5, 'תודה': 1, 'סבבה': 1,
  'עובד': 1, 'מהיר': 1, 'יעיל': 1.5, 'מקצועי': 1.5, 'אחלה': 2,
  // --- Hebrew negative ---
  'גרוע': -2, 'נורא': -2, 'איום': -2, 'רע': -2, 'שוברת': -2,
  'מעצבן': -1.5, 'מאכזב': -2, 'איטי': -1, 'תקול': -2, 'שבור': -2,
  'באג': -1.5, 'תקלה': -1.5, 'בעיה': -1, 'לא עובד': -2, 'מוחזרת': -1,
  'יקר מדי': -1.5, 'יקר': -1, 'מסובך': -1, 'קשה': -1, 'מתסכל': -1.5,
  'נתקע': -1.5, 'קורס': -2, 'חסר': -1, 'בעייתי': -1.5, 'מסורבל': -1.5,
  // --- English positive ---
  'excellent': 2, 'great': 2, 'awesome': 2, 'love': 2, 'perfect': 2,
  'good': 1, 'nice': 1, 'fast': 1, 'easy': 1, 'happy': 1,
  'satisfied': 1.5, 'recommend': 1.5, 'thanks': 1, 'works': 1,
  'useful': 1.5, 'reliable': 1.5, 'amazing': 2, 'smooth': 1.5,
  // --- English negative ---
  'bad': -2, 'terrible': -2, 'awful': -2, 'hate': -2, 'broken': -2,
  'buggy': -1.5, 'bug': -1.5, 'slow': -1, 'crash': -2, 'crashes': -2,
  'expensive': -1, 'costly': -1, 'hard': -1, 'confusing': -1.5,
  'frustrating': -1.5, 'issue': -1, 'problem': -1, 'fail': -1.5,
  'failed': -1.5, 'missing': -1, 'disappointing': -2, 'stuck': -1.5
};

// negation words to flip polarity of the next token
const NEGATIONS = new Set(['לא', 'אין', 'בלי', 'חסר', "don't", 'not', 'no', 'never', 'without']);

// Hebrew stop-words that should not seed clusters
const STOP_WORDS = new Set([
  'של', 'את', 'על', 'זה', 'זו', 'גם', 'כי', 'יש', 'אני', 'אתה', 'הוא', 'היא',
  'אנחנו', 'אתם', 'הם', 'הן', 'כן', 'רק', 'עם', 'או', 'אבל', 'כבר', 'אם',
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'am', 'be', 'been',
  'and', 'or', 'but', 'to', 'from', 'of', 'in', 'on', 'for', 'with',
  'this', 'that', 'these', 'those', 'it', 'they', 'we', 'i', 'you', 'he', 'she',
  'at', 'by', 'as', 'so', 'if'
]);

// --------------------------------------------------------------------------
// category keyword seeds — bilingual
// --------------------------------------------------------------------------
const CATEGORY_SEEDS = {
  'product-feedback': [
    'מוצר', 'פיצ\'ר', 'פיצר', 'מסך', 'ממשק', 'עיצוב', 'חוויה', 'שימוש',
    'product', 'feature', 'ui', 'ux', 'design', 'screen', 'interface', 'experience'
  ],
  'pricing': [
    'מחיר', 'מחירים', 'עלות', 'יקר', 'זול', 'מנוי', 'תשלום', 'חשבונית',
    'price', 'pricing', 'cost', 'expensive', 'cheap', 'subscription', 'invoice', 'bill', 'plan'
  ],
  'competition': [
    'מתחרה', 'מתחרים', 'חלופה', 'השוואה',
    'competitor', 'competitors', 'alternative', 'versus', 'vs', 'compared'
  ],
  'support': [
    'תמיכה', 'שירות', 'נציג', 'צ\'אט', 'הודעה', 'מענה', 'תגובה', 'פנייה',
    'support', 'service', 'agent', 'help', 'helpdesk', 'chat', 'response', 'ticket', 'representative'
  ],
  'feature-request': [
    'בקשה', 'תוספת', 'הוספה', 'רוצה', 'חסר', 'אפשרות', 'אפשר',
    'request', 'feature-request', 'add', 'wish', 'need', 'could', 'would love', 'please add', 'missing'
  ],
  'bug': [
    'באג', 'תקלה', 'שבור', 'קרס', 'לא עובד', 'בעייתי', 'שגיאה', 'נתקע', 'קורס',
    'bug', 'broken', 'crash', 'error', 'issue', 'failure', 'stuck', 'glitch', 'defect'
  ],
  'compliment': [
    'תודה', 'מעולה', 'מצוין', 'אהבתי', 'מדהים', 'מושלם', 'ממליץ',
    'thanks', 'thank', 'great', 'excellent', 'awesome', 'love', 'amazing', 'perfect', 'recommend'
  ]
};

// category names bilingual
const CATEGORY_LABELS = {
  'product-feedback': { he: 'משוב מוצר', en: 'Product Feedback' },
  'pricing':           { he: 'תמחור',    en: 'Pricing' },
  'competition':       { he: 'תחרות',    en: 'Competition' },
  'support':           { he: 'תמיכה',    en: 'Support' },
  'feature-request':   { he: 'בקשת פיצ\'ר', en: 'Feature Request' },
  'bug':               { he: 'באג',      en: 'Bug' },
  'compliment':        { he: 'מחמאה',    en: 'Compliment' }
};

// --------------------------------------------------------------------------
// known competitor names — editable at runtime via `addCompetitor`
// --------------------------------------------------------------------------
const DEFAULT_COMPETITORS = [
  'priority', 'פריוריטי',
  'sap', 'אס.איי.פי',
  'rivhit', 'ריווחית',
  'hashavshevet', 'חשבשבת',
  'salesforce', 'hubspot', 'zoho',
  'netsuite', 'monday', 'מאנדיי',
  'oracle', 'microsoft dynamics', 'dynamics'
];

// =============================================================
// VOC class
// =============================================================
class VOC {
  constructor(options = {}) {
    this.items = [];        // captured voice items (append-only)
    this.themes = [];       // extracted/rolling themes (append-only)
    this.votes = [];        // votes on themes
    this.closeLoops = [];   // close-loop communications
    this.roadmapLinks = []; // {themeId, roadmapItemId, linkedAt}
    this.options = Object.assign({
      minClusterSize: 2,
      tokenMinLength: 2
    }, options);
    this.competitors = new Set(
      (options.competitors || DEFAULT_COMPETITORS).map(c => c.toLowerCase())
    );
    this.validSources = new Set([
      'survey', 'ticket', 'email', 'meeting-note',
      'review', 'call-transcript', 'social'
    ]);
    this.validCategories = Object.keys(CATEGORY_SEEDS);
  }

  // -----------------------------------------------------------
  // register a new competitor brand — grows, never shrinks
  // -----------------------------------------------------------
  addCompetitor(name) {
    if (typeof name === 'string' && name.trim()) {
      this.competitors.add(name.trim().toLowerCase());
    }
    return Array.from(this.competitors);
  }

  // -----------------------------------------------------------
  // lightweight Hebrew "stem": strip leading prefix letters (ה, ב, ל,
  // מ, ש, כ, ו) and the trailing suffix ות / ים / ה so that
  // morphological variants of the same root map together.
  // Zero deps, rule-based, safe for short words.
  // -----------------------------------------------------------
  _stemHebrew(tok) {
    if (!/[\u0590-\u05FF]/.test(tok)) return tok;
    let t = tok;
    // strip nikud
    t = t.replace(/[\u0591-\u05C7]/g, '');
    // strip common prefixes (single letter), but only if word remains >= 3 chars
    const prefixes = ['ה', 'ב', 'ל', 'מ', 'ש', 'כ', 'ו'];
    while (t.length > 3 && prefixes.includes(t[0])) {
      t = t.slice(1);
      // allow at most two prefix letters ("במובייל" → "מובייל" → stop)
      break;
    }
    // strip common suffixes
    const suffixes = ['ות', 'ים', 'ית'];
    for (const s of suffixes) {
      if (t.length > s.length + 2 && t.endsWith(s)) {
        t = t.slice(0, -s.length);
        break;
      }
    }
    // drop trailing "ה" only if word remains >= 3 chars
    if (t.length > 3 && t.endsWith('ה')) {
      t = t.slice(0, -1);
    }
    return t;
  }

  // -----------------------------------------------------------
  // tokenize bilingual text — returns lowercased keyword tokens
  // -----------------------------------------------------------
  _tokenize(text) {
    if (!text) return [];
    const lowered = String(text).toLowerCase();
    // split on whitespace + common punctuation; keep Hebrew + latin letters
    const raw = lowered.split(/[\s,.;:!?\-\(\)\[\]{}"'`~@#$%^&*\\\/|<>+=_\n\r\t]+/);
    const out = [];
    for (const tok of raw) {
      if (!tok) continue;
      if (tok.length < this.options.tokenMinLength) continue;
      // strip Hebrew nikud (vowel marks) — keeps roots intact
      const clean = tok.replace(/[\u0591-\u05C7]/g, '');
      if (!clean) continue;
      // apply Hebrew stemmer to normalize morphological variants
      out.push(this._stemHebrew(clean));
    }
    return out;
  }

  // -----------------------------------------------------------
  // detect language roughly: any Hebrew letter → "he"
  // -----------------------------------------------------------
  _detectLanguage(text) {
    return /[\u0590-\u05FF]/.test(String(text || '')) ? 'he' : 'en';
  }

  // -----------------------------------------------------------
  // tokenize preserving surface form (no stemming) — used by the
  // sentiment analyzer so the lexicon keys match literally.
  // -----------------------------------------------------------
  _surfaceTokens(text) {
    if (!text) return [];
    const lowered = String(text).toLowerCase();
    const raw = lowered.split(/[\s,.;:!?\-\(\)\[\]{}"'`~@#$%^&*\\\/|<>+=_\n\r\t]+/);
    const out = [];
    for (const tok of raw) {
      if (!tok) continue;
      const clean = tok.replace(/[\u0591-\u05C7]/g, '');
      if (!clean) continue;
      out.push(clean);
    }
    return out;
  }

  // -----------------------------------------------------------
  // simple bilingual lexicon sentiment with negation handling
  // returns { label:'positive'|'neutral'|'negative', score:Number }
  // -----------------------------------------------------------
  _analyzeSentiment(text) {
    // Use surface tokens (no stemming) so lexicon keys match literally
    const tokens = this._surfaceTokens(text);
    let score = 0;
    let hits = 0;
    for (let i = 0; i < tokens.length; i++) {
      const tk = tokens[i];
      // also try a single "ה" or "ו" prefix removed — common Hebrew pattern
      let match = null;
      if (tk in SENTIMENT_LEXICON) match = tk;
      else if (tk.length > 2 && (tk[0] === 'ה' || tk[0] === 'ו') && tk.slice(1) in SENTIMENT_LEXICON) {
        match = tk.slice(1);
      }
      if (match) {
        let val = SENTIMENT_LEXICON[match];
        // look back 1–2 tokens for a negation
        const prev1 = tokens[i - 1];
        const prev2 = tokens[i - 2];
        if ((prev1 && NEGATIONS.has(prev1)) || (prev2 && NEGATIONS.has(prev2))) {
          val = -val;
        }
        score += val;
        hits += 1;
      }
    }
    const normalized = hits === 0 ? 0 : score / Math.max(hits, 1);
    let label = 'neutral';
    if (normalized > 0.25) label = 'positive';
    else if (normalized < -0.25) label = 'negative';
    return { label, score: Number(normalized.toFixed(3)) };
  }

  // -----------------------------------------------------------
  // capture any customer voice item (survey, ticket, email...)
  // -----------------------------------------------------------
  captureItem(input = {}) {
    const { source, customerId, content, sentiment, date, author } = input;
    if (!source || !this.validSources.has(source)) {
      throw new Error(`VOC.captureItem: invalid source "${source}"`);
    }
    if (!customerId) {
      throw new Error('VOC.captureItem: customerId is required');
    }
    if (typeof content !== 'string' || !content.trim()) {
      throw new Error('VOC.captureItem: content must be a non-empty string');
    }
    const tokens = this._tokenize(content);
    const autoSentiment = this._analyzeSentiment(content);
    const language = this._detectLanguage(content);
    const competitorsMentioned = [];
    for (const c of this.competitors) {
      if (tokens.includes(c) || String(content).toLowerCase().includes(c)) {
        competitorsMentioned.push(c);
      }
    }
    const id = mkId('voc');
    const item = {
      id,
      source,
      customerId,
      content: String(content),
      sentiment: sentiment || autoSentiment.label,
      sentimentScore: autoSentiment.score,
      polarity: autoSentiment.score >= 0 ? 1 : -1,
      language,
      date: date ? new Date(date).toISOString() : new Date().toISOString(),
      author: author || 'anonymous',
      tokens,
      category: null,
      themeId: null,
      competitorsMentioned,
      createdAt: new Date().toISOString(),
      revisions: []
    };
    this.items.push(item);
    return item;
  }

  // -----------------------------------------------------------
  // categorize an item into one of the canonical buckets
  //   scoring = count of matched seed keywords per category
  //   ties broken in declaration order of CATEGORY_SEEDS
  // -----------------------------------------------------------
  categorize({ item, categories } = {}) {
    if (!item || !item.id) {
      throw new Error('VOC.categorize: item is required');
    }
    const itemRef = this.items.find(i => i.id === item.id) || item;
    const usableCats = Array.isArray(categories) && categories.length
      ? categories.filter(c => this.validCategories.includes(c))
      : this.validCategories;
    const scores = {};
    const contentLower = String(itemRef.content || '').toLowerCase();
    for (const cat of usableCats) {
      scores[cat] = 0;
      for (const seed of CATEGORY_SEEDS[cat] || []) {
        if (contentLower.includes(seed)) scores[cat] += 1;
      }
    }
    let best = null;
    let bestScore = 0;
    for (const cat of usableCats) {
      if (scores[cat] > bestScore) {
        best = cat;
        bestScore = scores[cat];
      }
    }
    // fall-back: if no seed matched, use sentiment polarity
    if (!best) {
      best = (itemRef.sentimentScore || 0) > 0 ? 'compliment' : 'product-feedback';
    }
    // preserve history
    if (itemRef.category && itemRef.category !== best) {
      itemRef.revisions.push({
        field: 'category',
        from: itemRef.category,
        to: best,
        at: new Date().toISOString()
      });
    }
    itemRef.category = best;
    itemRef.categoryScores = scores;
    return itemRef;
  }

  // -----------------------------------------------------------
  // unsupervised theme clustering on feature tokens.
  // Very small corpus — so we use a deterministic agglomerative
  // cluster over a bag-of-words Jaccard similarity.
  // period?: {from, to} ISO range filter
  // -----------------------------------------------------------
  themeExtraction(period) {
    const inRange = this._filterByPeriod(this.items, period);
    if (!inRange.length) return [];

    // build feature sets — drop stop words + very short tokens
    const featureSets = inRange.map(it => {
      const set = new Set();
      for (const t of it.tokens || []) {
        if (t.length < 3) continue;
        if (STOP_WORDS.has(t)) continue;
        set.add(t);
      }
      return { id: it.id, item: it, features: set };
    });

    // Jaccard similarity
    const jac = (a, b) => {
      if (!a.size && !b.size) return 0;
      let inter = 0;
      for (const x of a) if (b.has(x)) inter += 1;
      const union = a.size + b.size - inter;
      return union === 0 ? 0 : inter / union;
    };

    const SIM_THRESHOLD = 0.18; // empirical
    // greedy clustering — assign each item to the first cluster it matches
    const clusters = [];
    for (const fs of featureSets) {
      let placed = false;
      for (const cl of clusters) {
        const sim = jac(fs.features, cl.centroidSet);
        if (sim >= SIM_THRESHOLD) {
          cl.items.push(fs.item);
          // merge features into centroid
          for (const f of fs.features) cl.centroidSet.add(f);
          // update centroid term weights
          for (const f of fs.features) {
            cl.centroid[f] = (cl.centroid[f] || 0) + 1;
          }
          placed = true;
          break;
        }
      }
      if (!placed) {
        const c = {
          items: [fs.item],
          centroidSet: new Set(fs.features),
          centroid: {}
        };
        for (const f of fs.features) c.centroid[f] = 1;
        clusters.push(c);
      }
    }

    // materialize themes — preserve/refresh existing or create new
    const out = [];
    for (const cl of clusters) {
      if (cl.items.length < this.options.minClusterSize && clusters.length > 1) {
        // still emit a theme but flag as singleton — "grow, don't delete"
      }
      // derive a label from top-3 terms
      const sorted = Object.entries(cl.centroid).sort((a, b) => b[1] - a[1]);
      const topTerms = sorted.slice(0, 3).map(x => x[0]);
      const labelEn = topTerms.join(' / ') || 'general';
      // category vote by items
      const catCounts = {};
      for (const it of cl.items) {
        if (it.category) catCounts[it.category] = (catCounts[it.category] || 0) + 1;
      }
      const dominantCat = Object.entries(catCounts).sort((a, b) => b[1] - a[1])[0];
      const themeCat = dominantCat ? dominantCat[0] : null;

      // "upgrade not delete": re-use an existing theme whose seed set overlaps
      let theme = this.themes.find(t => {
        if (!t.centroid) return false;
        const sharedKeys = Object.keys(t.centroid).filter(k => cl.centroidSet.has(k));
        return sharedKeys.length >= Math.max(2, Math.floor(cl.centroidSet.size * 0.4));
      });
      if (!theme) {
        theme = {
          id: mkId('theme'),
          label: labelEn,
          labelHe: topTerms.join(' / ') || 'כללי',
          items: [],
          centroid: {},
          category: themeCat,
          createdAt: new Date().toISOString(),
          status: 'open',
          priority: null,
          weightTotal: 0,
          roadmapItemId: null,
          closeLoop: []
        };
        this.themes.push(theme);
      }
      // merge items in (de-dupe by id)
      const seen = new Set(theme.items.map(x => x.id));
      for (const it of cl.items) {
        if (!seen.has(it.id)) {
          theme.items.push({ id: it.id, customerId: it.customerId, date: it.date });
          seen.add(it.id);
        }
        // link the item back to the theme
        const origin = this.items.find(x => x.id === it.id);
        if (origin && !origin.themeId) origin.themeId = theme.id;
      }
      // merge centroid
      for (const [term, weight] of Object.entries(cl.centroid)) {
        theme.centroid[term] = (theme.centroid[term] || 0) + weight;
      }
      // refresh label from the merged centroid
      const reSorted = Object.entries(theme.centroid).sort((a, b) => b[1] - a[1]);
      const reTop = reSorted.slice(0, 3).map(x => x[0]);
      theme.label = reTop.join(' / ') || theme.label;
      theme.labelHe = reTop.join(' / ') || theme.labelHe;
      if (!theme.category && themeCat) theme.category = themeCat;
      out.push(theme);
    }
    return out;
  }

  // -----------------------------------------------------------
  // vote on a theme — stack customer weight (any positive number)
  // -----------------------------------------------------------
  voteOnTheme({ themeId, customerId, weight } = {}) {
    const theme = this.themes.find(t => t.id === themeId);
    if (!theme) throw new Error(`VOC.voteOnTheme: theme "${themeId}" not found`);
    if (!customerId) throw new Error('VOC.voteOnTheme: customerId required');
    const w = Number(weight);
    if (!Number.isFinite(w) || w <= 0) {
      throw new Error('VOC.voteOnTheme: weight must be > 0');
    }
    const vote = {
      id: mkId('vote'),
      themeId,
      customerId,
      weight: w,
      date: new Date().toISOString()
    };
    this.votes.push(vote);
    theme.votes = theme.votes || [];
    theme.votes.push(vote);
    theme.weightTotal = (theme.weightTotal || 0) + w;
    return vote;
  }

  // -----------------------------------------------------------
  // prioritize themes by chosen metric
  //   'count'            — number of distinct supporting items
  //   'revenue-weighted' — sum of customer vote weights
  //   'strategic-fit'    — blend: votes * 0.6 + items * 0.3 + recency * 0.1
  // -----------------------------------------------------------
  prioritizeThemes({ metric } = {}) {
    const sorted = [...this.themes];
    const score = (t) => {
      if (metric === 'count') return (t.items || []).length;
      if (metric === 'revenue-weighted') return t.weightTotal || 0;
      if (metric === 'strategic-fit') {
        const items = (t.items || []).length;
        const votes = t.weightTotal || 0;
        const last = (t.items || []).reduce((acc, x) => {
          const ts = Date.parse(x.date || 0) || 0;
          return Math.max(acc, ts);
        }, 0);
        const recency = last > 0 ? 1 / Math.max(1, (Date.now() - last) / 8.64e7) : 0;
        return votes * 0.6 + items * 0.3 + recency * 0.1;
      }
      // default: count
      return (t.items || []).length;
    };
    sorted.sort((a, b) => score(b) - score(a));
    // annotate in-place so callers can inspect the priority
    sorted.forEach((t, idx) => { t.priority = idx + 1; });
    return sorted;
  }

  // -----------------------------------------------------------
  // link a theme to a roadmap item id (append-only history)
  // -----------------------------------------------------------
  linkToRoadmap({ themeId, roadmapItemId } = {}) {
    const theme = this.themes.find(t => t.id === themeId);
    if (!theme) throw new Error(`VOC.linkToRoadmap: theme "${themeId}" not found`);
    if (!roadmapItemId) throw new Error('VOC.linkToRoadmap: roadmapItemId required');
    const previous = theme.roadmapItemId;
    theme.roadmapItemId = roadmapItemId;
    theme.status = 'linked';
    this.roadmapLinks.push({
      themeId,
      roadmapItemId,
      previous,
      linkedAt: new Date().toISOString()
    });
    return theme;
  }

  // -----------------------------------------------------------
  // communicate back to customers when a theme is addressed
  // -----------------------------------------------------------
  closeLoop({ themeId, customerIds, updateText, date } = {}) {
    const theme = this.themes.find(t => t.id === themeId);
    if (!theme) throw new Error(`VOC.closeLoop: theme "${themeId}" not found`);
    if (!Array.isArray(customerIds) || !customerIds.length) {
      throw new Error('VOC.closeLoop: customerIds must be a non-empty array');
    }
    if (!updateText || typeof updateText !== 'string') {
      throw new Error('VOC.closeLoop: updateText required');
    }
    const entry = {
      id: mkId('cl'),
      themeId,
      customerIds: [...customerIds],
      updateText: String(updateText),
      date: date ? new Date(date).toISOString() : new Date().toISOString()
    };
    this.closeLoops.push(entry);
    theme.closeLoop = theme.closeLoop || [];
    theme.closeLoop.push(entry);
    theme.status = 'closed-loop';
    return entry;
  }

  // -----------------------------------------------------------
  // rising trends by category over a period
  // returns { category: { count, delta } }
  // delta = current window vs previous window of equal length
  // -----------------------------------------------------------
  trendByCategory(period) {
    const { from, to } = this._normalizePeriod(period);
    const windowMs = to.getTime() - from.getTime();
    const prevFrom = new Date(from.getTime() - windowMs);
    const current = this._filterByPeriod(this.items, { from, to });
    const previous = this._filterByPeriod(this.items, { from: prevFrom, to: from });
    const tally = (arr) => {
      const m = {};
      for (const it of arr) {
        const c = it.category || 'uncategorized';
        m[c] = (m[c] || 0) + 1;
      }
      return m;
    };
    const curMap = tally(current);
    const prevMap = tally(previous);
    const out = {};
    const allCats = new Set([...Object.keys(curMap), ...Object.keys(prevMap)]);
    for (const c of allCats) {
      const cur = curMap[c] || 0;
      const prv = prevMap[c] || 0;
      out[c] = {
        count: cur,
        previous: prv,
        delta: cur - prv,
        deltaPct: prv === 0 ? (cur > 0 ? 1 : 0) : Number(((cur - prv) / prv).toFixed(3)),
        rising: cur > prv
      };
    }
    return out;
  }

  // -----------------------------------------------------------
  // extract competitor mentions across items in a period
  // returns array of { competitor, count, items[] }
  // -----------------------------------------------------------
  competitorMentions(period) {
    const inRange = this._filterByPeriod(this.items, period);
    const counts = {};
    for (const it of inRange) {
      for (const c of it.competitorsMentioned || []) {
        if (!counts[c]) counts[c] = { competitor: c, count: 0, items: [] };
        counts[c].count += 1;
        counts[c].items.push(it.id);
      }
    }
    return Object.values(counts).sort((a, b) => b.count - a.count);
  }

  // -----------------------------------------------------------
  // all feature-requests from a given customer, newest first
  // -----------------------------------------------------------
  featureRequestTracker({ customerId } = {}) {
    if (!customerId) throw new Error('VOC.featureRequestTracker: customerId required');
    return this.items
      .filter(it => it.customerId === customerId && it.category === 'feature-request')
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  }

  // -----------------------------------------------------------
  // voice share: distribution of items by category
  //   optional product filter — substring match on content
  //   optional period filter
  // -----------------------------------------------------------
  voiceShare({ product, period } = {}) {
    let scope = this._filterByPeriod(this.items, period);
    if (product) {
      const q = String(product).toLowerCase();
      scope = scope.filter(it => String(it.content || '').toLowerCase().includes(q));
    }
    const total = scope.length;
    const by = {};
    for (const it of scope) {
      const c = it.category || 'uncategorized';
      by[c] = (by[c] || 0) + 1;
    }
    const share = {};
    for (const [c, n] of Object.entries(by)) {
      share[c] = {
        count: n,
        share: total === 0 ? 0 : Number((n / total).toFixed(3)),
        label: CATEGORY_LABELS[c] || { he: c, en: c }
      };
    }
    return { total, share };
  }

  // -----------------------------------------------------------
  // generate a bilingual product brief for a PM from a theme
  // -----------------------------------------------------------
  generateProductBrief(themeId) {
    const theme = this.themes.find(t => t.id === themeId);
    if (!theme) throw new Error(`VOC.generateProductBrief: theme "${themeId}" not found`);
    const supporting = theme.items || [];
    const resolvedItems = supporting
      .map(x => this.items.find(i => i.id === x.id))
      .filter(Boolean);
    const quotes = resolvedItems.slice(0, 5).map(i => ({
      content: i.content,
      source: i.source,
      language: i.language,
      customerId: i.customerId,
      date: i.date
    }));
    const customers = [...new Set(supporting.map(x => x.customerId))];
    const sentiments = resolvedItems.map(i => i.sentimentScore || 0);
    const avgSent = sentiments.length
      ? sentiments.reduce((a, b) => a + b, 0) / sentiments.length
      : 0;
    const topTerms = Object.entries(theme.centroid || {})
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(x => x[0]);
    const catLabel = CATEGORY_LABELS[theme.category] || { he: 'כללי', en: 'General' };
    return {
      themeId: theme.id,
      title: {
        en: `Product Brief: ${theme.label}`,
        he: `תקציר מוצר: ${theme.labelHe}`
      },
      category: catLabel,
      supportingCustomers: customers.length,
      supportingItems: resolvedItems.length,
      votesTotal: theme.weightTotal || 0,
      priority: theme.priority,
      averageSentiment: Number(avgSent.toFixed(3)),
      topKeywords: topTerms,
      roadmapItemId: theme.roadmapItemId || null,
      status: theme.status,
      summary: {
        en: `${resolvedItems.length} customer voices across ${customers.length} customers are clustered around "${theme.label}". ` +
            `Dominant category: ${catLabel.en}. Total customer weight: ${theme.weightTotal || 0}. ` +
            `Average sentiment: ${avgSent.toFixed(2)}.`,
        he: `${resolvedItems.length} משובי לקוח מ-${customers.length} לקוחות מתקבצים סביב "${theme.labelHe}". ` +
            `קטגוריה דומיננטית: ${catLabel.he}. סך משקל לקוחות: ${theme.weightTotal || 0}. ` +
            `ממוצע סנטימנט: ${avgSent.toFixed(2)}.`
      },
      quotes,
      generatedAt: new Date().toISOString()
    };
  }

  // =============================================================
  // helpers
  // =============================================================
  _normalizePeriod(period) {
    let from, to;
    if (period && period.from) from = new Date(period.from);
    else from = new Date(0);
    if (period && period.to) to = new Date(period.to);
    else to = new Date();
    return { from, to };
  }

  _filterByPeriod(items, period) {
    if (!period) return items.slice();
    const { from, to } = this._normalizePeriod(period);
    const ft = from.getTime();
    const tt = to.getTime();
    return items.filter(it => {
      const d = Date.parse(it.date || it.createdAt || 0);
      return d >= ft && d <= tt;
    });
  }
}

module.exports = {
  VOC,
  SENTIMENT_LEXICON,
  CATEGORY_SEEDS,
  CATEGORY_LABELS,
  DEFAULT_COMPETITORS
};
