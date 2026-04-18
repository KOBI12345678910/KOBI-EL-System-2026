/**
 * ONYX AI — Natural Language Query Engine (Agent Y-151)
 * ------------------------------------------------------------
 * Zero-dependency NLQ engine. Pure Node built-ins. No npm, no
 * neural nets, no external LLMs. Deterministic Hebrew + English
 * intent classifier using keyword-weighted bag-of-words plus
 * rule-based slot extraction.
 *
 * Core design: "לא מוחקים רק משדרגים ומגדלים".
 * This module does not depend on any other ONYX module and does
 * not delete or mutate anything — it transforms free text into
 * a structured QueryIntent object that downstream services use
 * to build SQL, Elasticsearch or KnowledgeGraph queries.
 *
 * Pipeline
 * --------
 *   text (he/en)
 *      │
 *      ▼
 *   normalizeText()  — lower, strip punctuation, preserve Hebrew
 *      │
 *      ▼
 *   tokenize()       — whitespace split + Hebrew prefix stripping
 *      │              (ב- ל- מ- ש- ה- ו- כ- כש-)
 *      ▼
 *   classifyIntent() — bag-of-words keyword weighting per intent
 *      │
 *      ▼
 *   extractSlots()   — entity, aggregation, time range, filters
 *      │
 *      ▼
 *   QueryIntent { intent, entity, timeRange, aggregation,
 *                 filters, confidence, debug }
 *
 * All exports are value-preserving: calling `parseQuery` twice on
 * the same input returns a structurally equal object (no Date.now,
 * no random). Time-range extraction uses an optional `now` param
 * for reproducible tests.
 */

// ============================================================
// Types — public contract
// ============================================================

export type IntentKind =
  | 'aggregate'
  | 'filter_date'
  | 'filter_party'
  | 'top_n'
  | 'compare'
  | 'trend'
  | 'list'
  | 'unknown';

export type EntityKind =
  | 'orders'
  | 'invoices'
  | 'customers'
  | 'suppliers'
  | 'inventory'
  | 'payments'
  | 'employees'
  | 'projects'
  | 'unknown';

export type AggregationKind = 'sum' | 'avg' | 'count' | 'min' | 'max' | null;

export type PartyRole = 'customer' | 'supplier' | 'employee' | 'project';

export interface TimeRange {
  /** ISO yyyy-mm-dd inclusive */
  start: string;
  /** ISO yyyy-mm-dd inclusive */
  end: string;
  /** human label e.g. "yesterday", "Q1 2026", "השנה שעברה" */
  label: string;
}

export interface PartyFilter {
  role: PartyRole;
  name: string;
}

export interface NumericFilter {
  field: string;
  op: '>' | '<' | '>=' | '<=' | '=' | '!=';
  value: number;
}

export interface QueryFilters {
  parties: PartyFilter[];
  numeric: NumericFilter[];
  rawTerms: string[];
}

export interface QueryIntent {
  intent: IntentKind;
  entity: EntityKind;
  timeRange: TimeRange | null;
  aggregation: AggregationKind;
  filters: QueryFilters;
  /** 0..1 */
  confidence: number;
  topN: number | null;
  comparisonTargets: string[];
  /** original free-text query */
  raw: string;
  /** normalized, lowercased form */
  normalized: string;
  /** tokens after prefix stripping */
  tokens: string[];
  /** detected language */
  language: 'he' | 'en' | 'mixed';
  /** internal trace for debugging tests */
  debug: {
    intentScores: Record<IntentKind, number>;
    entityScores: Record<EntityKind, number>;
    matchedKeywords: string[];
  };
}

// ============================================================
// Hebrew number words — digits 0..19 + tens + hundreds + thousands
// ============================================================

const HEBREW_NUMBERS: Record<string, number> = {
  אפס: 0,
  אחד: 1,
  אחת: 1,
  ראשון: 1,
  ראשונה: 1,
  שניים: 2,
  שתיים: 2,
  שני: 2,
  שתי: 2,
  שלוש: 3,
  שלושה: 3,
  ארבע: 4,
  ארבעה: 4,
  חמש: 5,
  חמישה: 5,
  שש: 6,
  שישה: 6,
  שבע: 7,
  שבעה: 7,
  שמונה: 8,
  תשע: 9,
  תשעה: 9,
  עשר: 10,
  עשרה: 10,
  עשרים: 20,
  שלושים: 30,
  ארבעים: 40,
  חמישים: 50,
  שישים: 60,
  שבעים: 70,
  שמונים: 80,
  תשעים: 90,
  מאה: 100,
  מאתיים: 200,
  שלוש_מאות: 300,
  ארבע_מאות: 400,
  חמש_מאות: 500,
  אלף: 1000,
  אלפיים: 2000,
  עשרת_אלפים: 10000,
  מיליון: 1000000,
};

/**
 * Parse a Hebrew-written number into a JS number. Supports simple
 * additive composition ("חמישים ושלושה" → 53) and the standalone
 * words. Returns NaN when no recognisable Hebrew number is present.
 */
export function parseHebrewNumber(text: string): number {
  if (!text) return NaN;
  const raw = text.trim();
  // Direct digits win.
  const asNum = Number(raw.replace(/[,\s]/g, ''));
  if (!Number.isNaN(asNum)) return asNum;

  const parts = raw
    .replace(/-/g, ' ')
    .split(/\s+/)
    .map((w) => w.replace(/^ו/, '')) // strip leading vav ("and")
    .filter(Boolean);
  if (parts.length === 0) return NaN;

  let total = 0;
  let found = false;
  for (const part of parts) {
    if (part in HEBREW_NUMBERS) {
      total += HEBREW_NUMBERS[part];
      found = true;
    }
  }
  return found ? total : NaN;
}

// ============================================================
// Tokenizer — Hebrew prefix stripping + whitespace split
// ============================================================

/** Hebrew one-letter inseparable prefixes. Order matters: longer first. */
const HEBREW_PREFIXES = ['כש', 'מש', 'לכש', 'ב', 'ל', 'מ', 'ש', 'ה', 'ו', 'כ'];

/**
 * Words that start with what *looks* like a Hebrew prefix but are
 * themselves standalone vocabulary — do not strip these.
 * This list is load-bearing because naive prefix stripping would
 * destroy question words, demonstratives, and common finance nouns.
 */
const HEBREW_NO_STRIP = new Set([
  // Question words
  'כמה',
  'היכן',
  'היום',
  'השבוע',
  'השנה',
  'החודש',
  // Demonstratives / pronouns
  'הכל',
  'הכי',
  'הוא',
  'היא',
  'הנה',
  // Adverbs / negations
  'מאוד',
  'מעל',
  'מתחת',
  'מה',
  // Common finance / business terms that begin with a prefix letter
  'מלאי',
  'מחסן',
  'מוצר',
  'מוצרים',
  'מספר',
  'מכירות',
  'ממוצע',
  'מגמה',
  'מגמת',
  'מתי',
  'מולח',
  'לקוח',
  'לקוחות',
  'ספק',
  'ספקים',
  'הזמנה',
  'הזמנות',
  'השוואה',
  'השווה',
  'סכום',
  // Days / months (most already ok, but keep safe list)
  'אתמול',
]);

const STOPWORDS_HE = new Set([
  'של',
  'את',
  'עם',
  'על',
  'זה',
  'זו',
  'אני',
  'הוא',
  'היא',
  'אנחנו',
  'הם',
  'הן',
  'יש',
  'אין',
  'לא',
  'כן',
  'או',
  'גם',
  'רק',
  'אבל',
  'אם',
  'כי',
  'מי',
  'מה',
  'איך',
  'איפה',
  'מתי',
  'למה',
  'איזה',
]);

const STOPWORDS_EN = new Set([
  'the',
  'a',
  'an',
  'of',
  'in',
  'on',
  'at',
  'to',
  'for',
  'is',
  'are',
  'was',
  'were',
  'by',
  'with',
  'from',
  'as',
  'and',
  'or',
  'but',
  'if',
  'that',
  'this',
]);

const HEBREW_LETTERS = /[\u05D0-\u05EA]/;

export function isHebrew(token: string): boolean {
  return HEBREW_LETTERS.test(token);
}

export function detectLanguage(text: string): 'he' | 'en' | 'mixed' {
  const hasHe = /[\u05D0-\u05EA]/.test(text);
  const hasEn = /[a-zA-Z]/.test(text);
  if (hasHe && hasEn) return 'mixed';
  if (hasHe) return 'he';
  return 'en';
}

/**
 * Normalize text for the NLQ pipeline:
 *  - lowercase ASCII
 *  - strip final-form Hebrew letters to non-final (ם→מ, ן→נ, ץ→צ,
 *    ף→פ, ך→כ)
 *  - collapse punctuation to spaces (keep digits, Hebrew, letters,
 *    %, -, :, /)
 *  - collapse whitespace
 */
export function normalizeText(text: string): string {
  if (!text) return '';
  const finalMap: Record<string, string> = {
    'ם': 'מ',
    'ן': 'נ',
    'ץ': 'צ',
    'ף': 'פ',
    'ך': 'כ',
  };
  let out = text.toLowerCase();
  out = out.replace(/[םןץףך]/g, (ch) => finalMap[ch] || ch);
  out = out.replace(/["׳״'`]/g, '');
  out = out.replace(/[^\u05D0-\u05EAa-z0-9\s%\-:/]/g, ' ');
  out = out.replace(/\s+/g, ' ').trim();
  return out;
}

/** Strip Hebrew inseparable prefixes from a single token. */
export function stripHebrewPrefix(token: string): string {
  if (!isHebrew(token)) return token;
  // Never strip if the token is shorter than 3 chars — 2-letter
  // Hebrew words like "של", "את" are meaningful.
  if (token.length < 3) return token;
  // Whitelist — never touch recognised vocabulary even when it
  // begins with a letter that normally acts as a prefix.
  if (HEBREW_NO_STRIP.has(token)) return token;
  for (const pre of HEBREW_PREFIXES) {
    if (token.length - pre.length >= 2 && token.startsWith(pre)) {
      return token.slice(pre.length);
    }
  }
  return token;
}

/**
 * Full tokenizer: normalize → split on whitespace → strip
 * Hebrew prefixes → drop stopwords. Returns lowercased tokens.
 */
export function tokenize(text: string): string[] {
  const normalized = normalizeText(text);
  if (!normalized) return [];
  const raw = normalized.split(/\s+/).filter(Boolean);
  const stripped = raw.map(stripHebrewPrefix);
  return stripped.filter((t) => {
    if (t.length === 0) return false;
    if (STOPWORDS_HE.has(t)) return false;
    if (STOPWORDS_EN.has(t)) return false;
    return true;
  });
}

// ============================================================
// Intent keyword tables — weighted bag-of-words classifier
// ============================================================

type KeywordWeight = Record<string, number>;

/**
 * Apply the same normalization to keyword strings that user input
 * goes through, so the classifier never misses due to final-mem
 * vs regular-mem mismatches etc. This is done at module load time.
 */
function normalizeKeywordBag(bag: KeywordWeight): KeywordWeight {
  const out: KeywordWeight = {};
  for (const [kw, weight] of Object.entries(bag)) {
    const norm = normalizeText(kw);
    if (!norm) continue;
    // If two raw keywords collapse to the same normalized form,
    // keep the higher weight.
    out[norm] = Math.max(out[norm] || 0, weight);
  }
  return out;
}

/**
 * Each entry maps a keyword (Hebrew OR English) to its contribution
 * weight. Keywords are matched against the token list AND the raw
 * normalized text — the latter catches multi-word phrases.
 */
const INTENT_KEYWORDS_RAW: Record<IntentKind, KeywordWeight> = {
  aggregate: {
    // Hebrew
    כמה: 3,
    סך: 3,
    'סך הכל': 4,
    'סה"כ': 4,
    סהכ: 4,
    סכום: 3,
    ממוצע: 3,
    ממוצעים: 3,
    מספר: 2,
    סופר: 2,
    לספור: 3,
    // English
    total: 3,
    sum: 3,
    average: 3,
    avg: 3,
    mean: 3,
    count: 3,
    'how many': 3,
    'how much': 3,
    max: 2,
    min: 2,
    maximum: 2,
    minimum: 2,
  },
  filter_date: {
    אתמול: 4,
    היום: 3,
    מחר: 3,
    השבוע: 4,
    'שבוע שעבר': 4,
    החודש: 4,
    'חודש שעבר': 4,
    השנה: 3,
    'השנה שעברה': 5,
    רבעון: 3,
    q1: 4,
    q2: 4,
    q3: 4,
    q4: 4,
    yesterday: 4,
    today: 3,
    tomorrow: 3,
    week: 3,
    month: 3,
    year: 3,
    'last week': 4,
    'last month': 4,
    'last year': 5,
    quarter: 3,
  },
  filter_party: {
    ספק: 3,
    ספקים: 3,
    לקוח: 3,
    לקוחות: 3,
    supplier: 3,
    suppliers: 3,
    vendor: 3,
    vendors: 3,
    customer: 3,
    customers: 3,
    client: 3,
    clients: 3,
    מ: 1,
    for: 1,
    from: 1,
  },
  top_n: {
    הכי: 3,
    ביותר: 3,
    גדול: 2,
    גדולים: 3,
    'הכי גדולים': 5,
    יקר: 2,
    יקרים: 3,
    'הכי יקרים': 5,
    זול: 2,
    זולים: 3,
    top: 4,
    most: 3,
    biggest: 3,
    largest: 3,
    highest: 3,
    lowest: 3,
    cheapest: 3,
    expensive: 2,
    ranking: 4,
    ranked: 4,
    'top 10': 5,
    'top 5': 5,
  },
  compare: {
    השווה: 5,
    להשוות: 5,
    השוואה: 5,
    לעומת: 4,
    מול: 3,
    בין: 2,
    'השווה בין': 6,
    compare: 5,
    comparison: 5,
    versus: 4,
    vs: 4,
    'vs.': 4,
    between: 2,
    against: 3,
  },
  trend: {
    מגמה: 5,
    מגמת: 5,
    'מה המגמה': 6,
    התפתחות: 4,
    גרף: 3,
    לאורך: 3,
    'לאורך זמן': 5,
    trend: 5,
    trending: 4,
    over_time: 4,
    'over time': 4,
    evolution: 4,
    history: 3,
    historic: 3,
    chart: 2,
    graph: 2,
  },
  list: {
    הצג: 3,
    הראה: 3,
    תן: 2,
    רשימה: 4,
    רשימת: 4,
    show: 3,
    list: 4,
    display: 3,
    give: 2,
    fetch: 3,
    get: 2,
  },
  unknown: {},
};

const ENTITY_KEYWORDS_RAW: Record<EntityKind, KeywordWeight> = {
  orders: {
    הזמנה: 4,
    הזמנות: 4,
    הזמנת: 3,
    order: 4,
    orders: 4,
    po: 3,
    'purchase order': 5,
  },
  invoices: {
    חשבונית: 4,
    חשבוניות: 4,
    חשבונייה: 4,
    חשבון: 3,
    invoice: 4,
    invoices: 4,
    bill: 3,
    bills: 3,
    receipt: 3,
  },
  customers: {
    לקוח: 4,
    לקוחות: 4,
    customer: 4,
    customers: 4,
    client: 4,
    clients: 4,
  },
  suppliers: {
    ספק: 4,
    ספקים: 4,
    קבלן: 3,
    קבלנים: 3,
    supplier: 4,
    suppliers: 4,
    vendor: 4,
    vendors: 4,
    contractor: 3,
    contractors: 3,
  },
  inventory: {
    מלאי: 5,
    מחסן: 4,
    מוצר: 3,
    מוצרים: 3,
    פריט: 3,
    פריטים: 3,
    inventory: 5,
    stock: 4,
    warehouse: 4,
    product: 3,
    products: 3,
    sku: 3,
    item: 3,
    items: 3,
  },
  payments: {
    תשלום: 4,
    תשלומים: 4,
    העברה: 3,
    payment: 4,
    payments: 4,
    transfer: 3,
    wire: 3,
  },
  employees: {
    עובד: 4,
    עובדים: 4,
    שכר: 3,
    משכורת: 3,
    employee: 4,
    employees: 4,
    staff: 3,
    payroll: 3,
    salary: 3,
  },
  projects: {
    פרויקט: 4,
    פרויקטים: 4,
    project: 4,
    projects: 4,
  },
  unknown: {},
};

const AGGREGATION_KEYWORDS_RAW: Record<Exclude<AggregationKind, null>, KeywordWeight> = {
  sum: {
    סך: 3,
    סכום: 3,
    'סך הכל': 4,
    סהכ: 3,
    'סה"כ': 4,
    total: 3,
    sum: 4,
    sumOf: 3,
    'total of': 4,
  },
  avg: {
    ממוצע: 4,
    ממוצעים: 4,
    average: 4,
    avg: 4,
    mean: 4,
  },
  count: {
    כמה: 3,
    מספר: 3,
    לספור: 3,
    'כמה יש': 4,
    count: 4,
    'how many': 4,
    'number of': 4,
  },
  min: {
    מינימום: 4,
    'הכי קטן': 3,
    'הכי נמוך': 3,
    min: 3,
    minimum: 4,
    lowest: 3,
  },
  max: {
    מקסימום: 4,
    'הכי גבוה': 3,
    'הכי גדול': 3,
    max: 3,
    maximum: 4,
    highest: 3,
  },
};

// Normalized versions — these are what the classifier actually uses.
// The _RAW tables are kept separate so human readers can still see
// the unmodified Hebrew forms, including final-form letters.
const INTENT_KEYWORDS: Record<IntentKind, KeywordWeight> = {
  aggregate: normalizeKeywordBag(INTENT_KEYWORDS_RAW.aggregate),
  filter_date: normalizeKeywordBag(INTENT_KEYWORDS_RAW.filter_date),
  filter_party: normalizeKeywordBag(INTENT_KEYWORDS_RAW.filter_party),
  top_n: normalizeKeywordBag(INTENT_KEYWORDS_RAW.top_n),
  compare: normalizeKeywordBag(INTENT_KEYWORDS_RAW.compare),
  trend: normalizeKeywordBag(INTENT_KEYWORDS_RAW.trend),
  list: normalizeKeywordBag(INTENT_KEYWORDS_RAW.list),
  unknown: {},
};

const ENTITY_KEYWORDS: Record<EntityKind, KeywordWeight> = {
  orders: normalizeKeywordBag(ENTITY_KEYWORDS_RAW.orders),
  invoices: normalizeKeywordBag(ENTITY_KEYWORDS_RAW.invoices),
  customers: normalizeKeywordBag(ENTITY_KEYWORDS_RAW.customers),
  suppliers: normalizeKeywordBag(ENTITY_KEYWORDS_RAW.suppliers),
  inventory: normalizeKeywordBag(ENTITY_KEYWORDS_RAW.inventory),
  payments: normalizeKeywordBag(ENTITY_KEYWORDS_RAW.payments),
  employees: normalizeKeywordBag(ENTITY_KEYWORDS_RAW.employees),
  projects: normalizeKeywordBag(ENTITY_KEYWORDS_RAW.projects),
  unknown: {},
};

const AGGREGATION_KEYWORDS: Record<Exclude<AggregationKind, null>, KeywordWeight> = {
  sum: normalizeKeywordBag(AGGREGATION_KEYWORDS_RAW.sum),
  avg: normalizeKeywordBag(AGGREGATION_KEYWORDS_RAW.avg),
  count: normalizeKeywordBag(AGGREGATION_KEYWORDS_RAW.count),
  min: normalizeKeywordBag(AGGREGATION_KEYWORDS_RAW.min),
  max: normalizeKeywordBag(AGGREGATION_KEYWORDS_RAW.max),
};

// ============================================================
// Intent classifier
// ============================================================

interface IntentClassification {
  intent: IntentKind;
  scores: Record<IntentKind, number>;
  confidence: number;
  matchedKeywords: string[];
}

function scoreBag(normalized: string, tokens: string[], bag: KeywordWeight): {
  score: number;
  matched: string[];
} {
  let score = 0;
  const matched: string[] = [];
  for (const [kw, weight] of Object.entries(bag)) {
    if (!weight) continue;
    if (kw.includes(' ') || kw.includes('_')) {
      // Phrase: check normalized string
      const needle = kw.replace(/_/g, ' ');
      if (normalized.includes(needle)) {
        score += weight;
        matched.push(kw);
      }
    } else {
      // Single word: check token membership
      if (tokens.includes(kw)) {
        score += weight;
        matched.push(kw);
      } else if (kw.length > 3 && normalized.includes(kw)) {
        // Fallback substring search for long tokens — handles tokens
        // that survived differently after prefix stripping.
        score += Math.max(1, weight - 1);
        matched.push(kw);
      }
    }
  }
  return { score, matched };
}

export function classifyIntent(
  normalized: string,
  tokens: string[],
): IntentClassification {
  const scores: Record<IntentKind, number> = {
    aggregate: 0,
    filter_date: 0,
    filter_party: 0,
    top_n: 0,
    compare: 0,
    trend: 0,
    list: 0,
    unknown: 0,
  };
  const matchedAll: string[] = [];

  for (const intentKey of Object.keys(INTENT_KEYWORDS) as IntentKind[]) {
    const bag = INTENT_KEYWORDS[intentKey];
    if (!bag) continue;
    const { score, matched } = scoreBag(normalized, tokens, bag);
    scores[intentKey] = score;
    matchedAll.push(...matched);
  }

  // Pick highest-scoring intent. On tie, prefer more specific intents
  // over the generic "list".
  const priority: IntentKind[] = [
    'compare',
    'trend',
    'top_n',
    'aggregate',
    'filter_date',
    'filter_party',
    'list',
    'unknown',
  ];
  let winner: IntentKind = 'unknown';
  let winnerScore = 0;
  for (const kind of priority) {
    const s = scores[kind];
    if (s > winnerScore) {
      winner = kind;
      winnerScore = s;
    }
  }

  // Confidence = winner score / sum-of-top-2 scores, clipped to 0..1
  const sorted = Object.values(scores).sort((a, b) => b - a);
  const top1 = sorted[0] || 0;
  const top2 = sorted[1] || 0;
  const confidence =
    top1 === 0 ? 0 : Math.min(1, top1 / Math.max(1, top1 + top2 * 0.5));

  return {
    intent: winner,
    scores,
    confidence,
    matchedKeywords: Array.from(new Set(matchedAll)),
  };
}

// ============================================================
// Entity classifier
// ============================================================

function classifyEntity(
  normalized: string,
  tokens: string[],
): { entity: EntityKind; scores: Record<EntityKind, number> } {
  const scores: Record<EntityKind, number> = {
    orders: 0,
    invoices: 0,
    customers: 0,
    suppliers: 0,
    inventory: 0,
    payments: 0,
    employees: 0,
    projects: 0,
    unknown: 0,
  };
  for (const key of Object.keys(ENTITY_KEYWORDS) as EntityKind[]) {
    const { score } = scoreBag(normalized, tokens, ENTITY_KEYWORDS[key]);
    scores[key] = score;
  }

  // Priority order: transactional entities outrank party entities on
  // ties because in queries like "הזמנות מספק X" the user wants the
  // orders (transactional) filtered BY the supplier (party).
  const priority: EntityKind[] = [
    'orders',
    'invoices',
    'payments',
    'inventory',
    'projects',
    'employees',
    'customers',
    'suppliers',
    'unknown',
  ];

  let entity: EntityKind = 'unknown';
  let best = 0;
  for (const key of priority) {
    if (scores[key] > best) {
      best = scores[key];
      entity = key;
    }
  }
  return { entity, scores };
}

// ============================================================
// Aggregation extractor
// ============================================================

function extractAggregation(
  normalized: string,
  tokens: string[],
): AggregationKind {
  let best: AggregationKind = null;
  let bestScore = 0;
  for (const kind of Object.keys(AGGREGATION_KEYWORDS) as Exclude<
    AggregationKind,
    null
  >[]) {
    const { score } = scoreBag(normalized, tokens, AGGREGATION_KEYWORDS[kind]);
    if (score > bestScore) {
      bestScore = score;
      best = kind;
    }
  }
  return best;
}

// ============================================================
// Time-range extractor — pure function of text + now
// ============================================================

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function toIso(d: Date): string {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(
    d.getUTCDate(),
  )}`;
}

function dayRange(d: Date, label: string): TimeRange {
  const iso = toIso(d);
  return { start: iso, end: iso, label };
}

function weekRange(now: Date, offsetWeeks: number, label: string): TimeRange {
  // ISO week starts Monday. Use UTC to stay deterministic.
  const base = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  const dayOfWeek = (base.getUTCDay() + 6) % 7; // 0=Mon
  base.setUTCDate(base.getUTCDate() - dayOfWeek + offsetWeeks * 7);
  const start = new Date(base);
  const end = new Date(base);
  end.setUTCDate(end.getUTCDate() + 6);
  return { start: toIso(start), end: toIso(end), label };
}

function monthRange(year: number, month: number, label: string): TimeRange {
  // month is 1..12
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 0));
  return { start: toIso(start), end: toIso(end), label };
}

function quarterRange(year: number, q: 1 | 2 | 3 | 4): TimeRange {
  const startMonth = (q - 1) * 3 + 1;
  const start = new Date(Date.UTC(year, startMonth - 1, 1));
  const end = new Date(Date.UTC(year, startMonth + 2, 0));
  return {
    start: toIso(start),
    end: toIso(end),
    label: `Q${q} ${year}`,
  };
}

function yearRange(year: number): TimeRange {
  return {
    start: `${year}-01-01`,
    end: `${year}-12-31`,
    label: String(year),
  };
}

const HEBREW_MONTHS: Record<string, number> = {
  ינואר: 1,
  פברואר: 2,
  מרץ: 3,
  מרצ: 3,
  אפריל: 4,
  מאי: 5,
  יוני: 6,
  יולי: 7,
  אוגוסט: 8,
  ספטמבר: 9,
  אוקטובר: 10,
  נובמבר: 11,
  דצמבר: 12,
};

const ENGLISH_MONTHS: Record<string, number> = {
  january: 1,
  february: 2,
  march: 3,
  april: 4,
  may: 5,
  june: 6,
  july: 7,
  august: 8,
  september: 9,
  october: 10,
  november: 11,
  december: 12,
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};

export function extractTimeRange(
  normalized: string,
  tokens: string[],
  now: Date = new Date(),
): TimeRange | null {
  const nowUtc = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );

  // --- Explicit Q1..Q4 + optional year -------------------------------
  const quarterMatch = normalized.match(/\bq([1-4])(?:\s*(\d{4}))?\b/);
  if (quarterMatch) {
    const q = Number(quarterMatch[1]) as 1 | 2 | 3 | 4;
    const year = quarterMatch[2]
      ? Number(quarterMatch[2])
      : nowUtc.getUTCFullYear();
    return quarterRange(year, q);
  }

  // --- Hebrew "רבעון N" -------------------------------------------
  const hebQuarter = normalized.match(/רבעון\s+(\d|ראשון|שני|שלישי|רביעי)/);
  if (hebQuarter) {
    const map: Record<string, 1 | 2 | 3 | 4> = {
      '1': 1,
      '2': 2,
      '3': 3,
      '4': 4,
      ראשון: 1,
      שני: 2,
      שלישי: 3,
      רביעי: 4,
    };
    const q = map[hebQuarter[1]] || 1;
    return quarterRange(nowUtc.getUTCFullYear(), q);
  }

  // --- "2026", "בשנת 2026", year-only ------------------------------
  const yearMatch = normalized.match(/\b(19|20)(\d{2})\b/);

  // --- Single-word relatives (order matters: check longer phrases first)
  // Helper: ASCII \b does NOT treat Hebrew letters as word chars,
  // so we use an explicit whitespace-or-boundary lookaround.
  const has = (re: RegExp) => re.test(normalized);
  const hasToken = (word: string) =>
    tokens.includes(word) ||
    new RegExp(`(^|\\s)${word}(\\s|$)`).test(normalized);

  if (has(/השנה שעברה|last year/)) {
    return yearRange(nowUtc.getUTCFullYear() - 1);
  }
  if (hasToken('השנה') || has(/this year/)) {
    return yearRange(nowUtc.getUTCFullYear());
  }
  if (has(/שנה שעברה/)) {
    return yearRange(nowUtc.getUTCFullYear() - 1);
  }
  if (has(/שבוע שעבר|last week/)) {
    return weekRange(nowUtc, -1, 'last week');
  }
  if (hasToken('השבוע') || has(/this week/)) {
    return weekRange(nowUtc, 0, 'this week');
  }
  if (has(/חודש שעבר|last month/)) {
    const y = nowUtc.getUTCFullYear();
    const m = nowUtc.getUTCMonth() + 1; // 1..12
    const lastY = m === 1 ? y - 1 : y;
    const lastM = m === 1 ? 12 : m - 1;
    return monthRange(lastY, lastM, 'last month');
  }
  if (hasToken('החודש') || has(/this month/)) {
    return monthRange(
      nowUtc.getUTCFullYear(),
      nowUtc.getUTCMonth() + 1,
      'this month',
    );
  }
  if (hasToken('אתמול') || has(/\byesterday\b/)) {
    const y = new Date(nowUtc);
    y.setUTCDate(y.getUTCDate() - 1);
    return dayRange(y, 'yesterday');
  }
  if (hasToken('היום') || has(/\btoday\b/)) {
    return dayRange(nowUtc, 'today');
  }
  if (hasToken('מחר') || has(/\btomorrow\b/)) {
    const t = new Date(nowUtc);
    t.setUTCDate(t.getUTCDate() + 1);
    return dayRange(t, 'tomorrow');
  }

  // --- Named month + optional year --------------------------------
  for (const tk of tokens) {
    if (tk in HEBREW_MONTHS) {
      const m = HEBREW_MONTHS[tk];
      const y = yearMatch
        ? Number(`${yearMatch[1]}${yearMatch[2]}`)
        : nowUtc.getUTCFullYear();
      return monthRange(y, m, `${tk} ${y}`);
    }
    if (tk in ENGLISH_MONTHS) {
      const m = ENGLISH_MONTHS[tk];
      const y = yearMatch
        ? Number(`${yearMatch[1]}${yearMatch[2]}`)
        : nowUtc.getUTCFullYear();
      return monthRange(y, m, `${tk} ${y}`);
    }
  }

  if (yearMatch) {
    const year = Number(`${yearMatch[1]}${yearMatch[2]}`);
    return yearRange(year);
  }

  return null;
}

// ============================================================
// Top-N extractor
// ============================================================

export function extractTopN(normalized: string, tokens: string[]): number | null {
  // Explicit "top 10", "top 5"
  const topMatch = normalized.match(/\btop\s+(\d{1,3})\b/);
  if (topMatch) return Number(topMatch[1]);
  // Hebrew: "5 הכי", "10 ראשונים", "10 גדולים"
  const hebDigit = normalized.match(/(^|\s)(\d{1,3})\s+(הכי|ראשונים|גדולים)/);
  if (hebDigit) return Number(hebDigit[2]);
  // "הכי X" alone → default 10.
  // Hebrew word boundaries don't work with \b, so we check token
  // membership directly.
  const hasHeb = tokens.includes('הכי') || /(^|\s)הכי(\s|$)/.test(normalized);
  const hasEn = /\bmost\b|\btop\b/.test(normalized);
  if (hasHeb || hasEn) {
    // Try to parse a Hebrew number word in the token stream.
    for (const tk of tokens) {
      const n = parseHebrewNumber(tk);
      if (!Number.isNaN(n) && n > 0 && n < 1000) return n;
    }
    return 10;
  }
  return null;
}

// ============================================================
// Numeric filter extractor
// ============================================================

function extractNumericFilters(normalized: string): NumericFilter[] {
  const results: NumericFilter[] = [];
  const patterns: Array<{ re: RegExp; op: NumericFilter['op']; field: string }> = [
    { re: /מעל\s+(\d[\d,\.]*)/g, op: '>', field: 'amount' },
    { re: /גדול\s*מ\s*(\d[\d,\.]*)/g, op: '>', field: 'amount' },
    { re: /יותר\s*מ\s*(\d[\d,\.]*)/g, op: '>', field: 'amount' },
    { re: /מתחת\s*ל?\s*(\d[\d,\.]*)/g, op: '<', field: 'amount' },
    { re: /פחות\s*מ\s*(\d[\d,\.]*)/g, op: '<', field: 'amount' },
    { re: /above\s+(\d[\d,\.]*)/g, op: '>', field: 'amount' },
    { re: /greater\s+than\s+(\d[\d,\.]*)/g, op: '>', field: 'amount' },
    { re: /more\s+than\s+(\d[\d,\.]*)/g, op: '>', field: 'amount' },
    { re: /below\s+(\d[\d,\.]*)/g, op: '<', field: 'amount' },
    { re: /less\s+than\s+(\d[\d,\.]*)/g, op: '<', field: 'amount' },
    { re: /under\s+(\d[\d,\.]*)/g, op: '<', field: 'amount' },
  ];
  for (const pat of patterns) {
    let m;
    while ((m = pat.re.exec(normalized)) !== null) {
      const num = Number(m[1].replace(/,/g, ''));
      if (!Number.isNaN(num)) {
        results.push({ field: pat.field, op: pat.op, value: num });
      }
    }
  }
  return results;
}

// ============================================================
// Party / named-entity filter extractor
// ============================================================

function extractPartyFilters(
  normalized: string,
  tokens: string[],
  entity: EntityKind,
): PartyFilter[] {
  const parties: PartyFilter[] = [];

  // Hebrew quoted names  "ספק 'שלמה'"
  const quotedRe = /['"]([^'"]{2,40})['"]/g;
  let qm;
  while ((qm = quotedRe.exec(normalized)) !== null) {
    parties.push({ role: roleFromEntity(entity), name: qm[1] });
  }

  // "של ספק X" / "מספק X" / "supplier X"
  // Note: we DON'T use \b before Hebrew letters — JS word
  // boundaries only work around ASCII \w. Instead we accept
  // start-of-string or whitespace, followed by an optional
  // one-letter Hebrew prefix, then the role noun.
  const patterns: Array<{ re: RegExp; role: PartyRole }> = [
    {
      re: /(?:^|\s)[בלמשה]?ספק\s+([\u05D0-\u05EA][\u05D0-\u05EA\-]{1,40})/g,
      role: 'supplier',
    },
    {
      re: /(?:^|\s)[בלמשה]?לקוח\s+([\u05D0-\u05EA][\u05D0-\u05EA\-]{1,40})/g,
      role: 'customer',
    },
    { re: /\bsupplier\s+([a-z][a-z0-9\-]{1,40})/g, role: 'supplier' },
    { re: /\bvendor\s+([a-z][a-z0-9\-]{1,40})/g, role: 'supplier' },
    { re: /\bcustomer\s+([a-z][a-z0-9\-]{1,40})/g, role: 'customer' },
    { re: /\bclient\s+([a-z][a-z0-9\-]{1,40})/g, role: 'customer' },
  ];
  for (const p of patterns) {
    let m;
    while ((m = p.re.exec(normalized)) !== null) {
      // Skip the category token itself (e.g. "supplier suppliers")
      const name = m[1];
      if (
        name === 'suppliers' ||
        name === 'customers' ||
        name === 'vendors' ||
        name === 'clients'
      ) {
        continue;
      }
      parties.push({ role: p.role, name });
    }
  }

  // Dedup by role+name
  const seen = new Set<string>();
  return parties.filter((p) => {
    const key = `${p.role}|${p.name}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function roleFromEntity(entity: EntityKind): PartyRole {
  switch (entity) {
    case 'customers':
      return 'customer';
    case 'suppliers':
      return 'supplier';
    case 'employees':
      return 'employee';
    case 'projects':
      return 'project';
    default:
      return 'customer';
  }
}

// ============================================================
// Comparison target extractor
// ============================================================

function extractComparisonTargets(normalized: string): string[] {
  const targets: string[] = [];
  // "X לעומת Y" / "X vs Y" / "X versus Y"
  const patterns = [
    /([\u05D0-\u05EA][\u05D0-\u05EA\s\-]{1,40})\s+לעומת\s+([\u05D0-\u05EA][\u05D0-\u05EA\s\-]{1,40})/,
    /([\u05D0-\u05EA][\u05D0-\u05EA\s\-]{1,40})\s+מול\s+([\u05D0-\u05EA][\u05D0-\u05EA\s\-]{1,40})/,
    /([a-z][a-z0-9\s\-]{1,40})\s+vs\.?\s+([a-z][a-z0-9\s\-]{1,40})/,
    /([a-z][a-z0-9\s\-]{1,40})\s+versus\s+([a-z][a-z0-9\s\-]{1,40})/,
  ];
  for (const re of patterns) {
    const m = normalized.match(re);
    if (m) {
      targets.push(m[1].trim());
      targets.push(m[2].trim());
      break;
    }
  }
  return targets;
}

// ============================================================
// Master parser
// ============================================================

export interface ParseOptions {
  /** Override "now" for deterministic time-range tests. */
  now?: Date;
}

export function parseQuery(
  input: string,
  opts: ParseOptions = {},
): QueryIntent {
  const raw = input || '';
  const normalized = normalizeText(raw);
  const tokens = tokenize(raw);
  const language = detectLanguage(raw);

  const classification = classifyIntent(normalized, tokens);
  const entityResult = classifyEntity(normalized, tokens);
  const aggregation = extractAggregation(normalized, tokens);
  const timeRange = extractTimeRange(normalized, tokens, opts.now);
  const topN = extractTopN(normalized, tokens);
  const numericFilters = extractNumericFilters(normalized);
  const parties = extractPartyFilters(normalized, tokens, entityResult.entity);
  const comparisonTargets = extractComparisonTargets(normalized);

  // --- Intent refinement ------------------------------------------
  // If the user wrote a question starting with "כמה" or "how many"
  // we upgrade to aggregate/count even when the entity bag also
  // pulled the score toward filter_party.
  let intent = classification.intent;
  if (aggregation && intent !== 'compare' && intent !== 'trend' && intent !== 'top_n') {
    intent = 'aggregate';
  }
  if (topN !== null && intent !== 'compare' && intent !== 'trend') {
    intent = 'top_n';
  }
  if (comparisonTargets.length >= 2) {
    intent = 'compare';
  }
  if (intent === 'unknown' && entityResult.entity !== 'unknown') {
    intent = 'list';
  }

  // If aggregation is missing but intent is aggregate, default to count
  const finalAggregation: AggregationKind =
    intent === 'aggregate' && !aggregation ? 'count' : aggregation;

  const confidence = Math.max(
    classification.confidence,
    intent === 'unknown' ? 0 : 0.15,
  );

  const rawTerms = tokens.filter(
    (t) => !classification.matchedKeywords.includes(t),
  );

  return {
    intent,
    entity: entityResult.entity,
    timeRange,
    aggregation: finalAggregation,
    filters: {
      parties,
      numeric: numericFilters,
      rawTerms,
    },
    confidence,
    topN,
    comparisonTargets,
    raw,
    normalized,
    tokens,
    language,
    debug: {
      intentScores: classification.scores,
      entityScores: entityResult.scores,
      matchedKeywords: classification.matchedKeywords,
    },
  };
}

// ============================================================
// Default export — convenient ESM/CJS interop
// ============================================================

const nlqEngine = {
  parseQuery,
  tokenize,
  normalizeText,
  stripHebrewPrefix,
  classifyIntent,
  extractTimeRange,
  extractTopN,
  parseHebrewNumber,
  detectLanguage,
};

export default nlqEngine;
