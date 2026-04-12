/**
 * Smart Bank Transaction Categorizer — Agent 90
 * Techno-Kol Uzi Mega-ERP (Kobi 2026)
 *
 * Classifies raw bank/credit-card transactions into Hebrew-labelled
 * categories using a built-in catalogue of 50+ Israeli merchants
 * (Shufersal, Rami Levy, Paz, Delek, Bezeq, ביטוח לאומי, etc.).
 *
 * Zero external dependencies — pure JS, bilingual (Hebrew/English).
 *
 * Exports:
 *   - categorize(transaction)            → { category, subcategory, confidence, matched_rule }
 *   - addRule(pattern, category, opts?)  → registers a custom rule (returns rule id)
 *   - learn(transaction, userCategory)   → remembers a user override
 *   - getRules()                         → current merged ruleset (read-only snapshot)
 *   - CATEGORIES                         → list of canonical Hebrew category labels
 *
 * Confidence scoring:
 *   - exact string match (normalized) .... 100
 *   - regex / anchored pattern match ...... 85
 *   - partial fuzzy (substring or token) .. 60
 *   - learned user override ............... 95
 *   - default / unmatched ................. 0   (category = "אחר")
 *
 * Rule object shape:
 *   {
 *     id:        string,
 *     pattern:   RegExp | string,
 *     category:  string,          // Hebrew canonical category
 *     subcategory?: string,
 *     priority:  number,          // higher wins, default 50
 *     source:    'builtin' | 'custom' | 'learned',
 *     match_kind?: 'exact' | 'regex' | 'fuzzy'
 *   }
 *
 * Run: require('./smart-categorizer').categorize({ description: 'SHUFERSAL TLV', amount: -245 })
 */

'use strict';

// ─────────────────────────────────────────────────────────────────────
// Canonical Hebrew categories
// ─────────────────────────────────────────────────────────────────────
const CATEGORIES = Object.freeze({
  INCOME:       'הכנסות',
  OPERATIONS:   'הוצאות תפעול',
  PAYROLL:      'שכר',
  FUEL:         'דלק',
  FOOD:         'מזון',
  TELECOM:      'תקשורת',
  MAINTENANCE:  'אחזקה',
  ARNONA:       'ארנונה',
  OFFICE:       'משרד',
  TRANSPORT:    'תחבורה',
  UTILITIES:    'חשמל ומים',
  BANK_FEES:    'עמלות בנק',
  GOVERNMENT:   'ממשלה',
  RETAIL:       'קמעונאות',
  RESTAURANT:   'מסעדות',
  ECOMMERCE:    'מסחר אלקטרוני',
  REAL_ESTATE:  'נדלן',
  SUPPLIERS:    'ספקים',
  OTHER:        'אחר',
});

// ─────────────────────────────────────────────────────────────────────
// Built-in rule catalogue (50+ Israeli merchants)
// Each rule carries a `priority` so more specific rules win.
//
// IMPLEMENTATION NOTE:
// JavaScript regex `\b` is ASCII-only and does not recognize Hebrew
// letters as word characters. We therefore:
//   • Use `\b` around ASCII-only alternatives.
//   • Use plain substring matching (no word boundary) for Hebrew
//     alternatives, which is safe because Hebrew merchant names are
//     distinctive and a transaction's description field rarely
//     contains unrelated Hebrew text that overlaps a brand.
//   • Combine both with `|` inside one pattern where practical.
// ─────────────────────────────────────────────────────────────────────
const BUILTIN_RULES = [
  // ── Food / supermarkets ─────────────────────────────────────────────
  { pattern: /\bshufersal\b|שופרסל/i,               category: CATEGORIES.FOOD, subcategory: 'סופרמרקט - שופרסל',      priority: 90 },
  { pattern: /\brami[\s-]?levy\b|רמי[\s-]?לוי/i,    category: CATEGORIES.FOOD, subcategory: 'סופרמרקט - רמי לוי',     priority: 90 },
  { pattern: /\bmega\b|מגה בעיר|מגה מרקט/i,         category: CATEGORIES.FOOD, subcategory: 'סופרמרקט - מגה',          priority: 85 },
  { pattern: /\byochananof\b|יוחננוף/i,             category: CATEGORIES.FOOD, subcategory: 'סופרמרקט - יוחננוף',      priority: 90 },
  { pattern: /\bvictory\b|ויקטורי/i,                category: CATEGORIES.FOOD, subcategory: 'סופרמרקט - ויקטורי',      priority: 90 },
  { pattern: /\bam[:\s-]?pm\b|איי אם פי אם/i,       category: CATEGORIES.FOOD, subcategory: 'מרכול - AM:PM',           priority: 85 },
  { pattern: /\btiv[\s-]?taam\b|טיב[\s-]?טעם/i,     category: CATEGORIES.FOOD, subcategory: 'סופרמרקט - טיב טעם',      priority: 90 },
  { pattern: /\bosher[\s-]?ad\b|אושר[\s-]?עד/i,     category: CATEGORIES.FOOD, subcategory: 'סופרמרקט - אושר עד',      priority: 90 },
  { pattern: /\bhazi[\s-]?hinam\b|חצי[\s-]?חינם/i,  category: CATEGORIES.FOOD, subcategory: 'סופרמרקט - חצי חינם',     priority: 90 },
  { pattern: /\bsuper[\s-]?pharm\b|סופר[\s-]?פארם/i,category: CATEGORIES.FOOD, subcategory: 'פארם - סופר פארם',        priority: 80 },

  // ── Fuel stations ───────────────────────────────────────────────────
  { pattern: /\bpaz\b|\bPAZ\b|תחנת פז/i,            category: CATEGORIES.FUEL, subcategory: 'תחנת דלק - פז',           priority: 90 },
  { pattern: /\bdelek\b(?! car)|תחנת דלק/i,          category: CATEGORIES.FUEL, subcategory: 'תחנת דלק - דלק',          priority: 85 },
  { pattern: /\bsonol\b|סונול/i,                    category: CATEGORIES.FUEL, subcategory: 'תחנת דלק - סונול',        priority: 90 },
  { pattern: /\bdor[\s-]?alon\b|דור[\s-]?אלון/i,    category: CATEGORIES.FUEL, subcategory: 'תחנת דלק - דור אלון',     priority: 90 },
  { pattern: /\bten petrol\b|טן דלק|תחנת טן/i,      category: CATEGORIES.FUEL, subcategory: 'תחנת דלק - טן',            priority: 85 },
  { pattern: /\bsadaf\b|סדף דלק/i,                  category: CATEGORIES.FUEL, subcategory: 'תחנת דלק - סדף',          priority: 85 },

  // ── Transport ───────────────────────────────────────────────────────
  { pattern: /\brav[\s-]?kav\b|רב[\s-]?קו/i,        category: CATEGORIES.TRANSPORT, subcategory: 'תחבורה ציבורית - רב קו', priority: 90 },
  { pattern: /\bgett\b|\bget taxi\b|גט טקסי/i,      category: CATEGORIES.TRANSPORT, subcategory: 'מונית - גט',              priority: 85 },
  { pattern: /\bpango\b|פנגו/i,                     category: CATEGORIES.TRANSPORT, subcategory: 'חניה - פנגו',             priority: 90 },
  { pattern: /\bcello[\s-]?park\b|סלופארק/i,        category: CATEGORIES.TRANSPORT, subcategory: 'חניה - סלופארק',          priority: 90 },
  { pattern: /\begged\b|אגד/i,                      category: CATEGORIES.TRANSPORT, subcategory: 'אוטובוס - אגד',            priority: 80 },
  { pattern: /\brakevet\b|רכבת ישראל/i,             category: CATEGORIES.TRANSPORT, subcategory: 'רכבת ישראל',              priority: 90 },

  // ── Utilities (electricity, water, internet, TV) ────────────────────
  { pattern: /\bbezeq\b|בזק/i,                      category: CATEGORIES.TELECOM, subcategory: 'בזק',         priority: 90 },
  { pattern: /\bpartner\b|פרטנר|\borange\b/i,       category: CATEGORIES.TELECOM, subcategory: 'פרטנר',        priority: 85 },
  { pattern: /\bcellcom\b|סלקום/i,                  category: CATEGORIES.TELECOM, subcategory: 'סלקום',        priority: 90 },
  { pattern: /\bpelephone\b|פלאפון/i,               category: CATEGORIES.TELECOM, subcategory: 'פלאפון',       priority: 90 },
  { pattern: /\bhot mobile\b|הוט מובייל|הוט טלקום/i,category: CATEGORIES.TELECOM, subcategory: 'הוט',           priority: 80 },
  { pattern: /\byes tv\b|\byes dbs\b|יס טלוויזיה/i, category: CATEGORIES.TELECOM, subcategory: 'יס',           priority: 75 },
  { pattern: /חברת החשמל/i,                          category: CATEGORIES.UTILITIES, subcategory: 'חברת החשמל', priority: 95 },
  { pattern: /\biec\b|israel electric/i,            category: CATEGORIES.UTILITIES, subcategory: 'חברת החשמל', priority: 90 },
  { pattern: /מי אביבים/i,                           category: CATEGORIES.UTILITIES, subcategory: 'מים - מי אביבים', priority: 95 },
  { pattern: /מקורות/i,                              category: CATEGORIES.UTILITIES, subcategory: 'מים - מקורות',     priority: 95 },
  { pattern: /תאגיד המים/i,                          category: CATEGORIES.UTILITIES, subcategory: 'תאגיד המים',       priority: 90 },

  // ── Banks / fees ────────────────────────────────────────────────────
  { pattern: /\bhapoalim\b|הפועלים|bank hapoalim/i, category: CATEGORIES.BANK_FEES, subcategory: 'בנק הפועלים', priority: 80 },
  { pattern: /\bleumi\b|בנק לאומי|לאומי בעמ/i,      category: CATEGORIES.BANK_FEES, subcategory: 'בנק לאומי',    priority: 80 },
  { pattern: /\bdiscount\b|דיסקונט/i,               category: CATEGORIES.BANK_FEES, subcategory: 'בנק דיסקונט', priority: 80 },
  { pattern: /\bmizrahi\b|מזרחי טפחות/i,            category: CATEGORIES.BANK_FEES, subcategory: 'בנק מזרחי',   priority: 80 },
  { pattern: /\byahav\b|בנק יהב/i,                  category: CATEGORIES.BANK_FEES, subcategory: 'בנק יהב',      priority: 80 },
  { pattern: /\bjerusalem bank\b|בנק ירושלים/i,     category: CATEGORIES.BANK_FEES, subcategory: 'בנק ירושלים',  priority: 80 },
  { pattern: /עמלת|\bcommission\b|\bfees?\b/i,      category: CATEGORIES.BANK_FEES, subcategory: 'עמלה',         priority: 60 },

  // ── Government / compliance ─────────────────────────────────────────
  { pattern: /ביטוח לאומי/i,                         category: CATEGORIES.GOVERNMENT, subcategory: 'ביטוח לאומי', priority: 95 },
  { pattern: /מס הכנסה/i,                            category: CATEGORIES.GOVERNMENT, subcategory: 'מס הכנסה',   priority: 95 },
  { pattern: /מע"?מ/i,                               category: CATEGORIES.GOVERNMENT, subcategory: 'מע"מ',        priority: 95 },
  { pattern: /עיריית/i,                              category: CATEGORIES.GOVERNMENT, subcategory: 'עירייה',      priority: 85 },
  { pattern: /ארנונה/i,                              category: CATEGORIES.ARNONA,    subcategory: 'ארנונה',      priority: 95 },
  { pattern: /רשות המיסים/i,                         category: CATEGORIES.GOVERNMENT, subcategory: 'רשות המיסים', priority: 95 },
  { pattern: /רשם החברות/i,                          category: CATEGORIES.GOVERNMENT, subcategory: 'רשם החברות',  priority: 90 },

  // ── Retail / fashion / hardware ─────────────────────────────────────
  { pattern: /\bfox fashion\b|\bfox home\b|פוקס/i,  category: CATEGORIES.RETAIL, subcategory: 'אופנה - פוקס',   priority: 80 },
  { pattern: /\bcastro\b|קסטרו/i,                   category: CATEGORIES.RETAIL, subcategory: 'אופנה - קסטרו',  priority: 85 },
  { pattern: /\bh&m\b|\bh & m\b/i,                  category: CATEGORIES.RETAIL, subcategory: 'אופנה - H&M',     priority: 85 },
  { pattern: /\bzara\b|זארה/i,                      category: CATEGORIES.RETAIL, subcategory: 'אופנה - ZARA',    priority: 85 },
  { pattern: /\bikea\b|איקאה/i,                     category: CATEGORIES.RETAIL, subcategory: 'ריהוט - איקאה',   priority: 90 },
  { pattern: /\bksp\b|קספ/i,                        category: CATEGORIES.RETAIL, subcategory: 'אלקטרוניקה - KSP', priority: 85 },
  { pattern: /\bbug\.co\.il\b|באג מולטיסיסטם/i,    category: CATEGORIES.RETAIL, subcategory: 'אלקטרוניקה - BUG', priority: 80 },
  { pattern: /\bhome center\b|הום סנטר/i,           category: CATEGORIES.MAINTENANCE, subcategory: 'הום סנטר',   priority: 85 },
  { pattern: /\bace hardware\b|אייס אוטו|אייס חנות/i, category: CATEGORIES.MAINTENANCE, subcategory: 'אייס',     priority: 80 },

  // ── Real estate / building ──────────────────────────────────────────
  { pattern: /ועד בית/i,                             category: CATEGORIES.REAL_ESTATE, subcategory: 'ועד בית',   priority: 90 },
  { pattern: /\brent\b|שכירות|שכר דירה/i,           category: CATEGORIES.REAL_ESTATE, subcategory: 'שכירות',    priority: 85 },
  { pattern: /משכנתא/i,                              category: CATEGORIES.REAL_ESTATE, subcategory: 'משכנתא',    priority: 90 },

  // ── Metal / fabrication suppliers (Techno-Kol specifics) ────────────
  { pattern: /\bhot[\s-]?mil\b|הוט[\s-]?מיל/i,      category: CATEGORIES.SUPPLIERS, subcategory: 'ספק - הוט מיל',   priority: 95 },
  { pattern: /\bbromil\b|ברומיל/i,                   category: CATEGORIES.SUPPLIERS, subcategory: 'ספק - ברומיל',    priority: 95 },
  { pattern: /\bakzo[\s-]?nobel\b/i,                 category: CATEGORIES.SUPPLIERS, subcategory: 'ספק - AkzoNobel', priority: 95 },
  { pattern: /שחל מתכות|\bshahal metals\b/i,         category: CATEGORIES.SUPPLIERS, subcategory: 'ספק - שחל מתכות',  priority: 90 },

  // ── Restaurants / cafes ─────────────────────────────────────────────
  { pattern: /\baroma\b|ארומה/i,                    category: CATEGORIES.RESTAURANT, subcategory: 'ארומה',        priority: 85 },
  { pattern: /\bcafe cafe\b|קפה קפה/i,              category: CATEGORIES.RESTAURANT, subcategory: 'קפה קפה',       priority: 85 },
  { pattern: /\bgreg\b|גרג קפה/i,                   category: CATEGORIES.RESTAURANT, subcategory: 'גרג',            priority: 80 },
  { pattern: /\bmcdonald'?s\b|מקדונלדס/i,           category: CATEGORIES.RESTAURANT, subcategory: 'מקדונלדס',      priority: 85 },
  { pattern: /\bburger king\b|בורגר קינג/i,         category: CATEGORIES.RESTAURANT, subcategory: 'בורגר קינג',    priority: 85 },
  { pattern: /\bdomino'?s?\b|דומינוס|דומינו'ס/i,    category: CATEGORIES.RESTAURANT, subcategory: 'דומינוס פיצה',  priority: 85 },
  { pattern: /\bpizza hut\b|פיצה האט/i,             category: CATEGORIES.RESTAURANT, subcategory: 'פיצה האט',      priority: 85 },
  { pattern: /\b10bis\b|10ביס|תן ביס/i,             category: CATEGORIES.RESTAURANT, subcategory: '10bis',          priority: 85 },

  // ── E-commerce / platforms ──────────────────────────────────────────
  { pattern: /\bamazon\b|אמזון/i,                   category: CATEGORIES.ECOMMERCE, subcategory: 'Amazon',       priority: 85 },
  { pattern: /\bali[\s-]?express\b|עליאקספרס/i,     category: CATEGORIES.ECOMMERCE, subcategory: 'AliExpress',   priority: 85 },
  { pattern: /\bshopify\b/i,                        category: CATEGORIES.ECOMMERCE, subcategory: 'Shopify',      priority: 85 },
  { pattern: /\bebay\b|איביי/i,                     category: CATEGORIES.ECOMMERCE, subcategory: 'eBay',         priority: 85 },
  { pattern: /\bpaypal\b|פייפאל/i,                  category: CATEGORIES.ECOMMERCE, subcategory: 'PayPal',       priority: 80 },

  // ── Income / inbound ────────────────────────────────────────────────
  { pattern: /העברה נכנסת|\bincoming transfer\b|\bdeposit\b|הפקדה/i,
                                                     category: CATEGORIES.INCOME, subcategory: 'הפקדה',          priority: 70 },
  { pattern: /זיכוי מלקוח|\brefund\b/i,             category: CATEGORIES.INCOME, subcategory: 'זיכוי',          priority: 55 },

  // ── Payroll (outbound payroll transfers) ────────────────────────────
  { pattern: /\bpayroll\b|משכורת|שכר עבודה/i,       category: CATEGORIES.PAYROLL, subcategory: 'משכורת',        priority: 90 },
  { pattern: /קרן פנסיה|\bpension fund\b/i,         category: CATEGORIES.PAYROLL, subcategory: 'פנסיה',         priority: 90 },
  { pattern: /קרן השתלמות/i,                         category: CATEGORIES.PAYROLL, subcategory: 'קרן השתלמות',  priority: 90 },
];

// ─────────────────────────────────────────────────────────────────────
// Internal state
// ─────────────────────────────────────────────────────────────────────
let _customRules = [];
let _learnedRules = []; // populated by learn()
let _idCounter = 0;

function _nextId(prefix) {
  _idCounter += 1;
  return `${prefix}-${_idCounter}`;
}

// ─────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────

/** Normalize a string for comparison: trim, collapse whitespace, lowercase (ASCII only). */
function _normalize(input) {
  if (input === null || input === undefined) return '';
  return String(input)
    .replace(/[\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** Extract all descriptive text fields from a transaction. */
function _extractText(transaction) {
  if (!transaction || typeof transaction !== 'object') return '';
  const parts = [
    transaction.description,
    transaction.memo,
    transaction.counterparty,
    transaction.counterparty_name,
    transaction.merchant,
    transaction.merchant_name,
    transaction.payee,
    transaction.narrative,
    transaction.details,
    transaction.raw,
    transaction.text,
  ];
  return parts.filter(Boolean).join(' ');
}

/** Check if a pattern matches a given text, returning the match kind. */
function _matchPattern(pattern, text, normalizedText) {
  if (pattern instanceof RegExp) {
    const m = pattern.exec(text);
    if (m) return { kind: 'regex', value: m[0] };
    // Try again on the normalized form (some banks upper-case everything)
    const m2 = pattern.exec(normalizedText);
    if (m2) return { kind: 'regex', value: m2[0] };
    return null;
  }
  if (typeof pattern === 'string') {
    const needle = _normalize(pattern);
    if (!needle) return null;
    if (normalizedText === needle) return { kind: 'exact', value: needle };
    if (normalizedText.includes(needle)) return { kind: 'fuzzy', value: needle };
    return null;
  }
  return null;
}

/** Map a match kind to a confidence score. */
function _confidenceFor(kind, source) {
  if (source === 'learned') return 95;
  switch (kind) {
    case 'exact': return 100;
    case 'regex': return 85;
    case 'fuzzy': return 60;
    default:      return 0;
  }
}

/** Build a canonical rule record from user input. */
function _buildRule(pattern, category, opts = {}) {
  if (!pattern) throw new Error('smart-categorizer: pattern is required');
  if (!category || typeof category !== 'string') {
    throw new Error('smart-categorizer: category is required (Hebrew string)');
  }
  const source = opts.source || 'custom';
  return {
    id: opts.id || _nextId(source),
    pattern,
    category,
    subcategory: opts.subcategory || null,
    priority: Number.isFinite(opts.priority) ? opts.priority : 50,
    source,
  };
}

/** All rules, highest priority first. Order: learned > custom > builtin (tie-broken by priority). */
function _allRules() {
  // Learned rules get an implicit +10 priority boost to beat built-ins on the same merchant
  const boosted = _learnedRules.map((r) => ({ ...r, priority: (r.priority || 50) + 10 }));
  const merged = [...boosted, ..._customRules, ...BUILTIN_RULES];
  return merged
    .map((r, idx) => ({ ...r, _idx: idx }))
    .sort((a, b) => {
      if (b.priority !== a.priority) return b.priority - a.priority;
      // Stable tie-break: preserve original merged order
      return a._idx - b._idx;
    });
}

// ─────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────

/**
 * Classify a transaction.
 * @param {object} transaction  A bank/credit-card transaction. Any of the
 *                              string fields (description, memo, counterparty,
 *                              merchant, payee, narrative, details, raw, text)
 *                              will be searched.
 * @returns {{
 *   category: string,
 *   subcategory: (string|null),
 *   confidence: number,
 *   matched_rule: (object|null)
 * }}
 */
function categorize(transaction) {
  const text = _extractText(transaction);
  const normalized = _normalize(text);

  if (!normalized) {
    return {
      category: CATEGORIES.OTHER,
      subcategory: null,
      confidence: 0,
      matched_rule: null,
    };
  }

  const rules = _allRules();

  for (const rule of rules) {
    const hit = _matchPattern(rule.pattern, text, normalized);
    if (!hit) continue;
    return {
      category: rule.category,
      subcategory: rule.subcategory || null,
      confidence: _confidenceFor(hit.kind, rule.source),
      matched_rule: {
        id: rule.id || null,
        pattern: rule.pattern instanceof RegExp
          ? rule.pattern.source
          : String(rule.pattern),
        category: rule.category,
        subcategory: rule.subcategory || null,
        priority: rule.priority,
        source: rule.source || 'builtin',
        match_kind: hit.kind,
        matched_text: hit.value,
      },
    };
  }

  // Heuristic fallback: amount sign infers income vs expense
  if (transaction && typeof transaction.amount === 'number') {
    if (transaction.amount > 0) {
      return {
        category: CATEGORIES.INCOME,
        subcategory: 'לא מזוהה',
        confidence: 30,
        matched_rule: { id: 'fallback-income', source: 'fallback', match_kind: 'sign' },
      };
    }
    if (transaction.amount < 0) {
      return {
        category: CATEGORIES.OPERATIONS,
        subcategory: 'לא מזוהה',
        confidence: 20,
        matched_rule: { id: 'fallback-expense', source: 'fallback', match_kind: 'sign' },
      };
    }
  }

  return {
    category: CATEGORIES.OTHER,
    subcategory: null,
    confidence: 0,
    matched_rule: null,
  };
}

/**
 * Register a custom rule.
 * @param {RegExp|string} pattern
 * @param {string} category   Hebrew category (e.g., CATEGORIES.FOOD)
 * @param {object} [opts]     { subcategory, priority }
 * @returns {string}          The rule id
 */
function addRule(pattern, category, opts = {}) {
  const rule = _buildRule(pattern, category, { ...opts, source: 'custom' });
  _customRules.push(rule);
  return rule.id;
}

/**
 * Record a user override so future similar transactions get the user's label.
 * Builds a literal (exact-substring) rule from the transaction's text.
 * @param {object} transaction
 * @param {string} userCategory  Hebrew category
 * @param {object} [opts]        { subcategory, priority }
 * @returns {string|null}        The learned rule id, or null on empty input
 */
function learn(transaction, userCategory, opts = {}) {
  const text = _extractText(transaction);
  const normalized = _normalize(text);
  if (!normalized || !userCategory) return null;

  // Extract a plausible merchant token (longest non-stopword token).
  const STOP = new Set([
    'the', 'and', 'for', 'ltd', 'inc', 'llc', 'bv', 'co', 'card', 'pos',
    'transaction', 'אשראי', 'חיוב', 'כרטיס', 'מס', 'תשלום', 'בעמ', 'בע"מ',
  ]);
  const tokens = normalized
    .split(/[^\p{L}\p{N}]+/u)
    .filter((t) => t && t.length >= 3 && !STOP.has(t));
  const token = tokens.sort((a, b) => b.length - a.length)[0] || normalized;

  const rule = _buildRule(token, userCategory, {
    ...opts,
    source: 'learned',
    priority: (opts.priority || 70),
  });
  _learnedRules.push(rule);
  return rule.id;
}

/** Return a snapshot of the currently active rules. */
function getRules() {
  return {
    builtin: BUILTIN_RULES.length,
    custom: _customRules.length,
    learned: _learnedRules.length,
    total: BUILTIN_RULES.length + _customRules.length + _learnedRules.length,
    rules: _allRules().map((r) => ({
      id: r.id || null,
      pattern: r.pattern instanceof RegExp ? r.pattern.source : String(r.pattern),
      category: r.category,
      subcategory: r.subcategory || null,
      priority: r.priority,
      source: r.source || 'builtin',
    })),
  };
}

/** Wipe all non-builtin rules. Never touches BUILTIN_RULES. */
function _resetForTests() {
  _customRules = [];
  _learnedRules = [];
}

module.exports = {
  CATEGORIES,
  categorize,
  addRule,
  learn,
  getRules,
  _resetForTests, // exposed for unit tests
  _internal: { BUILTIN_RULES, _normalize, _extractText, _matchPattern },
};
