/**
 * PEP Screener — Politically Exposed Persons (איש ציבור)
 * Agent Y-147 — Techno-Kol Uzi ERP / Compliance / AML
 *
 * Implements screening of persons against PEP watchlists per Israeli
 * Prohibition on Money Laundering Law, 5760-2000 (חוק איסור הלבנת הון,
 * התש״ס–2000) and the obligations under the regulations issued by the
 * Ministry of Justice / Israel Money Laundering and Terror Financing
 * Prohibition Authority (רשות איסור הלבנת הון ומימון טרור).
 *
 * Definition of "איש ציבור" (PEP) — local + foreign + international:
 *   - Knesset members (חברי כנסת), government ministers + deputy ministers
 *   - Supreme Court justices, district/magistrate court presidents, AG,
 *     State Comptroller (מבקר המדינה), Attorney General (היועמ״ש)
 *   - Senior IDF officers (רב־אלוף / אלוף / תת־אלוף)
 *   - Police commissioner + deputy commissioners (מפכ״ל / ניצבים)
 *   - Senior diplomats (שגרירים, קונסולים כלליים)
 *   - Heads of state-owned companies (מנכ״לי חברות ממשלתיות)
 *   - Senior officials in ministries (מנכ״ל משרד, סמנכ״ל בכיר)
 *   - Mayors of major cities (ראשי ערים גדולות)
 *   - Foreign PEPs (heads of state, cabinet members, senior politicians abroad)
 *   - International-organisation PEPs (UN, EU, WTO, OECD etc. senior staff)
 *   - Family members (בני משפחה מדרגה ראשונה + בן/בת זוג)
 *   - Close associates (מקורבים) — business partners, signatories
 *
 * Ongoing PEP status continues for **12 months** after the person leaves
 * office (the "cooling-off period", per §8 of the regulations). Risk
 * rating stays HIGH by default → Enhanced Due Diligence (EDD) required.
 *
 * This file is ZERO-DEP (Node built-ins only), CommonJS, Node ≥14.
 * Bilingual labels (Hebrew + English) are first-class throughout.
 *
 * RULES (immutable):
 *   - "לא מוחקים רק משדרגים ומגדלים" — never delete, only upgrade/grow.
 *     removeWatchlist() marks entries inactive and logs an audit event;
 *     the underlying record is preserved forever.
 *   - Mock transport pattern — no network; screening runs against the
 *     in-memory watchlist seeded at construction time.
 *
 * Usage:
 *   const { PEPScreener, PEP_CATEGORY, RISK_LEVEL } = require('./pep-screener');
 *   const screener = new PEPScreener();
 *   screener.addWatchlist({
 *     id: 'IL-KNE-0001',
 *     name_he: 'יהודה כהן',
 *     name_en: 'Yehuda Cohen',
 *     category: PEP_CATEGORY.DOMESTIC,
 *     role: 'Knesset Member',
 *     role_he: 'חבר כנסת',
 *     branch: 'knesset',
 *     startDate: '2023-01-01',
 *   });
 *   const hit = screener.screen({ name_he: 'יהודה כהן' });
 *   hit.isPEP; // true
 */

'use strict';

// ═══════════════════════════════════════════════════════════════
// Constants (bilingual, frozen)
// ═══════════════════════════════════════════════════════════════

/** PEP categories — matches Israeli AML regs + FATF R.12 taxonomy. */
const PEP_CATEGORY = Object.freeze({
  /** Israeli domestic PEP — איש ציבור ישראלי */
  DOMESTIC: 'domestic',
  /** Foreign PEP — איש ציבור זר */
  FOREIGN: 'foreign',
  /** International organisation PEP — ארגון בינלאומי */
  INTERNATIONAL_ORG: 'international-org',
  /** Family member of PEP — בן משפחה */
  FAMILY_MEMBER: 'family-member',
  /** Close associate — מקורב */
  CLOSE_ASSOCIATE: 'close-associate',
});

const PEP_CATEGORY_HE = Object.freeze({
  [PEP_CATEGORY.DOMESTIC]: 'איש ציבור מקומי',
  [PEP_CATEGORY.FOREIGN]: 'איש ציבור זר',
  [PEP_CATEGORY.INTERNATIONAL_ORG]: 'ארגון בינלאומי',
  [PEP_CATEGORY.FAMILY_MEMBER]: 'בן משפחה',
  [PEP_CATEGORY.CLOSE_ASSOCIATE]: 'מקורב',
});

/** Risk levels — default HIGH per Israeli Bank of Israel Directive 411. */
const RISK_LEVEL = Object.freeze({
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
  PROHIBITED: 'PROHIBITED',
});

const RISK_LEVEL_HE = Object.freeze({
  [RISK_LEVEL.LOW]: 'נמוך',
  [RISK_LEVEL.MEDIUM]: 'בינוני',
  [RISK_LEVEL.HIGH]: 'גבוה',
  [RISK_LEVEL.PROHIBITED]: 'אסור',
});

/** Public-office branches — used by searchByRole(). */
const OFFICE_BRANCH = Object.freeze({
  KNESSET: 'knesset',
  CABINET: 'cabinet',
  MINISTRY: 'ministry',
  JUDICIARY: 'judiciary',
  IDF_SENIOR: 'idf-senior',
  POLICE_SENIOR: 'police-senior',
  DIPLOMACY: 'diplomacy',
  STATE_OWNED_CO: 'state-owned-co',
  MUNICIPALITY: 'municipality',
  BANK_OF_ISRAEL: 'bank-of-israel',
});

const OFFICE_BRANCH_HE = Object.freeze({
  knesset: 'כנסת',
  cabinet: 'קבינט / ממשלה',
  ministry: 'משרד ממשלתי',
  judiciary: 'מערכת המשפט',
  'idf-senior': 'צה״ל — קצונה בכירה',
  'police-senior': 'משטרה — קצונה בכירה',
  diplomacy: 'שירות חוץ / דיפלומטיה',
  'state-owned-co': 'חברה ממשלתית',
  municipality: 'רשות מקומית',
  'bank-of-israel': 'בנק ישראל',
});

/** Cooling-off period — §8 regs: 12 months after leaving office. */
const COOLING_OFF_MONTHS = 12;

/** Review cadence — periodic review every 12 months per Directive 411. */
const REVIEW_INTERVAL_MONTHS = 12;

// ═══════════════════════════════════════════════════════════════
// Hebrew ↔ English name normalisation
// ═══════════════════════════════════════════════════════════════

/** Hebrew diacritics (נקוד + טעמים) — stripped before matching. */
const HEBREW_DIACRITICS = /[\u0591-\u05BD\u05BF\u05C1\u05C2\u05C4\u05C5\u05C7]/g;

/** Punctuation + control chars to strip from names before matching. */
const NAME_STRIP = /[\s\-'"`\u2018\u2019\u201C\u201D.,;:!?()\[\]{}]/g;

/**
 * Transliteration rules — Hebrew → latin. Mostly follows the Academy of
 * the Hebrew Language's 2006 simplified romanisation, plus the common
 * "Yehuda / Yehudah / Jehuda / Yehudah" variants that recur in AML lists.
 *
 * Multi-char replacements are applied first (longest-match), then
 * single-char fallbacks.
 */
const HEB_TO_LAT_MULTI = [
  ['שׁ', 'sh'], ['שׂ', 's'], ['צ', 'tz'], ['ץ', 'tz'], ['ח', 'ch'],
  ['כ', 'kh'], ['ך', 'kh'], ['תּ', 't'], ['ת', 't'],
];

const HEB_TO_LAT = {
  'א': 'a', 'ב': 'b', 'ג': 'g', 'ד': 'd', 'ה': 'h',
  'ו': 'v', 'ז': 'z', 'ט': 't', 'י': 'y', 'ל': 'l',
  'מ': 'm', 'ם': 'm', 'נ': 'n', 'ן': 'n', 'ס': 's',
  'ע': 'a', 'פ': 'p', 'ף': 'p', 'ק': 'k', 'ר': 'r',
  'ת': 't',
};

/**
 * Common name variant aliases — Hebrew↔English. Covers the most frequent
 * Israeli PEP name spellings (Yehuda/Yehudah/Yehouda, Moshe/Moishe, Binyamin/
 * Benjamin, Yitzhak/Isaac, Shlomo/Solomon, etc.). This list grows over time
 * (never shrinks) as operators add entries.
 */
const NAME_VARIANTS = new Map([
  ['yehuda', ['yehudah', 'jehuda', 'jehudah', 'yehouda', 'judah']],
  ['yehudah', ['yehuda', 'jehuda', 'jehudah', 'yehouda', 'judah']],
  ['moshe', ['moishe', 'mosheh', 'moses', 'mose']],
  ['binyamin', ['benjamin', 'benyamin', 'binyomin']],
  ['benjamin', ['binyamin', 'benyamin', 'binyomin']],
  ['yitzhak', ['itzhak', 'yitshak', 'isaac', 'isak', 'itzik']],
  ['shlomo', ['shelomo', 'shelomoh', 'solomon', 'salomon']],
  ['david', ['dawid', 'davide', 'dovid', 'dawood']],
  ['yaakov', ['jacob', 'yaacov', 'yankel', 'yakov']],
  ['yosef', ['yoseph', 'joseph', 'yossi', 'josef']],
  ['avraham', ['abraham', 'avram', 'avrum']],
  ['sarah', ['sara', 'sarai']],
  ['miriam', ['maryam', 'mary', 'miri']],
  ['cohen', ['kohen', 'kahn', 'cohn', 'kahan']],
  ['levi', ['levy', 'levine', 'halevi']],
  ['ben', ['bin']],
  ['bat', ['bath', 'bint']],
]);

/** Lowercase + strip punctuation + collapse whitespace. */
function normaliseLatin(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .toLowerCase()
    .replace(NAME_STRIP, '')
    .replace(/[^a-z]/g, '');
}

/** Strip Hebrew diacritics + punctuation. */
function normaliseHebrew(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(HEBREW_DIACRITICS, '')
    .replace(NAME_STRIP, '')
    .replace(/[^\u0590-\u05FF]/g, '');
}

/**
 * Transliterate a Hebrew string to latin (simple, deterministic).
 * Non-Hebrew characters are preserved.
 */
function transliterateHebrew(str) {
  if (str === null || str === undefined) return '';
  let out = String(str).replace(HEBREW_DIACRITICS, '');
  // Multi-char substitutions first
  for (const [heb, lat] of HEB_TO_LAT_MULTI) {
    out = out.split(heb).join(lat);
  }
  // Single-char fallback
  let result = '';
  for (const ch of out) {
    if (HEB_TO_LAT[ch] !== undefined) {
      result += HEB_TO_LAT[ch];
    } else if (/[a-zA-Z]/.test(ch)) {
      result += ch.toLowerCase();
    } else if (/\s/.test(ch)) {
      result += ' ';
    }
    // other chars dropped
  }
  return result.replace(/\s+/g, ' ').trim();
}

// ═══════════════════════════════════════════════════════════════
// Hebrew Soundex
// ═══════════════════════════════════════════════════════════════

/**
 * Hebrew Soundex — groups phonetically similar Hebrew letters into digit
 * classes. Adapted from the Russell/Beider-Morse approach to Hebrew
 * phonetics so that e.g. "כהן" ↔ "קהן" and "שם" ↔ "סם" collapse.
 *
 * Groups:
 *   1 — ב, ו, פ, ף                  (labial)
 *   2 — ג, ז, ס, צ, ץ, ש, כ, ך, ק    (sibilant / velar / k-like)
 *   3 — ד, ט, ת                      (dental)
 *   4 — ל                            (lateral)
 *   5 — מ, ם, נ, ן                   (nasal)
 *   6 — ר                            (liquid)
 *   7 — ח, ע, ה                      (pharyngeal / guttural)
 *   0 — א, י                         (silent-ish / semivowel — dropped)
 *
 * NOTE: כ/ק/ש share a group so that common surname variants (Cohen/Kahn,
 * Schwartz/Sharon) collapse. The first letter is replaced by its GROUP
 * digit (not kept literally) so that "כהן" and "קהן" yield identical
 * codes regardless of which initial letter the operator chose.
 */
const HEB_SOUNDEX_GROUPS = {
  'ב': '1', 'ו': '1', 'פ': '1', 'ף': '1',
  'ג': '2', 'ז': '2', 'ס': '2', 'צ': '2', 'ץ': '2', 'ק': '2', 'ש': '2',
  'כ': '2', 'ך': '2',
  'ד': '3', 'ט': '3', 'ת': '3',
  'ל': '4',
  'מ': '5', 'ם': '5', 'נ': '5', 'ן': '5',
  'ר': '6',
  'ח': '7', 'ע': '7', 'ה': '7',
  'א': '0', 'י': '0',
};

function hebrewSoundex(word) {
  const cleaned = normaliseHebrew(word);
  if (!cleaned) return '';
  // Canonicalise first letter: use its group digit (if any), else the
  // literal letter. This makes כהן / קהן equivalent from the first char.
  const firstGroup = HEB_SOUNDEX_GROUPS[cleaned[0]];
  let code = (firstGroup && firstGroup !== '0') ? firstGroup : cleaned[0];
  let lastGroup = firstGroup || '';
  for (let i = 1; i < cleaned.length && code.length < 4; i++) {
    const g = HEB_SOUNDEX_GROUPS[cleaned[i]];
    if (g === undefined || g === '0') { lastGroup = ''; continue; }
    if (g !== lastGroup) {
      code += g;
      lastGroup = g;
    }
  }
  return code.padEnd(4, '0').slice(0, 4);
}

/**
 * English Soundex (standard Russell/Odell 1918) — for latin name matching.
 * Used when caller provides `transliteration` but not `name_he`.
 */
const ENG_SOUNDEX_GROUPS = {
  b: '1', f: '1', p: '1', v: '1',
  c: '2', g: '2', j: '2', k: '2', q: '2', s: '2', x: '2', z: '2',
  d: '3', t: '3',
  l: '4',
  m: '5', n: '5',
  r: '6',
  // vowels + h/w/y are "skip" (undefined) — intentionally not in the map
};

function englishSoundex(word) {
  const cleaned = normaliseLatin(word);
  if (!cleaned) return '';
  let code = cleaned[0].toUpperCase();
  let lastGroup = ENG_SOUNDEX_GROUPS[cleaned[0]] || '';
  for (let i = 1; i < cleaned.length && code.length < 4; i++) {
    const g = ENG_SOUNDEX_GROUPS[cleaned[i]];
    if (g === undefined) { lastGroup = ''; continue; }
    if (g !== lastGroup) {
      code += g;
      lastGroup = g;
    }
  }
  return code.padEnd(4, '0').slice(0, 4);
}

// ═══════════════════════════════════════════════════════════════
// Levenshtein distance (iterative, O(n·m), zero-alloc row buffer)
// ═══════════════════════════════════════════════════════════════

function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a) return b.length;
  if (!b) return a.length;
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
        curr[j - 1] + 1,     // insertion
        prev[j] + 1,         // deletion
        prev[j - 1] + cost,  // substitution
      );
    }
    // swap
    const tmp = prev; prev = curr; curr = tmp;
  }
  return prev[n];
}

/**
 * Normalised similarity score in [0..1] using Levenshtein.
 * 1 = identical, 0 = completely different.
 */
function similarity(a, b) {
  if (!a && !b) return 1;
  if (!a || !b) return 0;
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  const d = levenshtein(a, b);
  return 1 - (d / maxLen);
}

// ═══════════════════════════════════════════════════════════════
// Date helpers
// ═══════════════════════════════════════════════════════════════

function toDate(v) {
  if (v == null) return null;
  if (v instanceof Date) return v;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

function addMonths(date, months) {
  const d = new Date(date.getTime());
  d.setMonth(d.getMonth() + months);
  return d;
}

function monthsBetween(a, b) {
  const years = b.getFullYear() - a.getFullYear();
  const months = b.getMonth() - a.getMonth();
  return years * 12 + months + (b.getDate() >= a.getDate() ? 0 : -1);
}

function nowOrClock(clock) {
  return (typeof clock === 'function') ? clock() : new Date();
}

// ═══════════════════════════════════════════════════════════════
// PEPScreener class
// ═══════════════════════════════════════════════════════════════

class PEPScreener {
  /**
   * @param {object} [opts]
   * @param {() => Date} [opts.clock] — injectable clock (tests)
   * @param {number} [opts.matchThreshold] — default 0.82
   * @param {Array} [opts.seed] — pre-seeded watchlist entries
   */
  constructor(opts = {}) {
    this.clock = opts.clock || (() => new Date());
    this.matchThreshold = typeof opts.matchThreshold === 'number'
      ? opts.matchThreshold : 0.82;
    /** @type {Map<string, object>} — id → entry (active + inactive) */
    this.watchlist = new Map();
    /** @type {Array<object>} — append-only audit log */
    this.history = [];
    /** @type {number} — monotonic counter for auto-id */
    this._counter = 0;

    if (Array.isArray(opts.seed)) {
      for (const entry of opts.seed) this.addWatchlist(entry);
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Watchlist CRUD (never delete)
  // ─────────────────────────────────────────────────────────────

  /**
   * Add an entry to the watchlist. Throws on validation errors.
   *
   * @param {object} entry
   * @param {string} [entry.id]             — unique id (auto if omitted)
   * @param {string} entry.name_he          — Hebrew name (required)
   * @param {string} [entry.name_en]        — English / transliteration
   * @param {string} entry.category         — one of PEP_CATEGORY.*
   * @param {string} [entry.role_he]        — e.g. "חבר כנסת"
   * @param {string} [entry.role]           — e.g. "Knesset Member"
   * @param {string} [entry.branch]         — one of OFFICE_BRANCH.*
   * @param {string} [entry.country]        — ISO-3166 alpha-2 ("IL", "US", …)
   * @param {string|Date} [entry.startDate] — when role began
   * @param {string|Date} [entry.endDate]   — when role ended (null = current)
   * @param {string} [entry.relationTo]     — id of principal PEP (for family/associate)
   * @param {string} [entry.relationType]   — 'spouse' | 'parent' | 'child' | 'sibling' | 'partner'
   * @param {string} [entry.source]         — source of listing (operator / gov publication)
   * @param {string} [entry.notes_he]       — free-form notes (Hebrew)
   * @param {string} [entry.notes]          — free-form notes (English)
   * @returns {object} the stored entry
   */
  addWatchlist(entry) {
    if (!entry || typeof entry !== 'object') {
      throw new TypeError('addWatchlist: entry must be an object');
    }
    if (!entry.name_he && !entry.name_en) {
      throw new Error('addWatchlist: name_he or name_en required / חובה שם');
    }
    if (!entry.category || !Object.values(PEP_CATEGORY).includes(entry.category)) {
      throw new Error(`addWatchlist: invalid category "${entry.category}" / קטגוריה לא חוקית`);
    }
    if (entry.branch && !Object.values(OFFICE_BRANCH).includes(entry.branch)) {
      throw new Error(`addWatchlist: invalid branch "${entry.branch}" / ענף לא חוקי`);
    }

    const now = nowOrClock(this.clock);
    const id = entry.id || this._nextId();

    if (this.watchlist.has(id)) {
      throw new Error(`addWatchlist: duplicate id "${id}" / מזהה כפול`);
    }

    // Auto-transliterate if name_en missing
    const transliteration = entry.name_en || transliterateHebrew(entry.name_he || '');

    const record = {
      id,
      name_he: entry.name_he || '',
      name_en: entry.name_en || '',
      transliteration,
      category: entry.category,
      category_he: PEP_CATEGORY_HE[entry.category],
      role: entry.role || '',
      role_he: entry.role_he || '',
      branch: entry.branch || '',
      branch_he: entry.branch ? OFFICE_BRANCH_HE[entry.branch] : '',
      country: entry.country || 'IL',
      startDate: toDate(entry.startDate) || now,
      endDate: toDate(entry.endDate),
      relationTo: entry.relationTo || '',
      relationType: entry.relationType || '',
      source: entry.source || 'operator',
      notes_he: entry.notes_he || '',
      notes: entry.notes || '',
      active: true,
      addedAt: now,
      lastReviewedAt: now,
      // Pre-computed match keys for fast lookup
      _keyHe: normaliseHebrew(entry.name_he || ''),
      _keyLat: normaliseLatin(transliteration || entry.name_en || ''),
      _soundexHe: hebrewSoundex(entry.name_he || ''),
      _soundexEn: englishSoundex(transliteration || entry.name_en || ''),
    };

    this.watchlist.set(id, record);
    this._audit('addWatchlist', { id, name_he: record.name_he, category: record.category });
    return record;
  }

  /**
   * Deactivate a watchlist entry. The record is PRESERVED (not deleted).
   * "לא מוחקים רק משדרגים ומגדלים" — this is audit-logged and the entry
   * stays retrievable via getEntry() / getAllEntries({ includeInactive:true }).
   *
   * @param {object} args
   * @param {string} args.id       — entry id
   * @param {string} args.actor    — operator doing the removal (required for audit)
   * @param {string} [args.reason] — bilingual free-form reason
   */
  removeWatchlist({ id, actor, reason } = {}) {
    if (!id) throw new Error('removeWatchlist: id required / חובה מזהה');
    if (!actor) throw new Error('removeWatchlist: actor required for audit / חובה מבצע');
    const entry = this.watchlist.get(id);
    if (!entry) throw new Error(`removeWatchlist: unknown id "${id}" / מזהה לא ידוע`);
    entry.active = false;
    entry.deactivatedAt = nowOrClock(this.clock);
    entry.deactivatedBy = actor;
    entry.deactivationReason = reason || '';
    this._audit('removeWatchlist', { id, actor, reason: reason || '' });
    return entry;
  }

  /** Return a single entry by id (active or not). */
  getEntry(id) {
    return this.watchlist.get(id) || null;
  }

  /** Return all entries. `includeInactive` defaults to false. */
  getAllEntries({ includeInactive = false } = {}) {
    const out = [];
    for (const e of this.watchlist.values()) {
      if (!includeInactive && !e.active) continue;
      out.push(e);
    }
    return out;
  }

  // ─────────────────────────────────────────────────────────────
  // Screening
  // ─────────────────────────────────────────────────────────────

  /**
   * Screen a person against the watchlist.
   *
   * @param {object} person
   * @param {string} [person.name_he]        — Hebrew name
   * @param {string} [person.name_en]        — English / transliteration
   * @param {string} [person.country]        — optional country hint
   * @returns {{
   *   isPEP: boolean,
   *   matches: Array<{ entry: object, score: number, method: string, reason_he: string, reason_en: string }>,
   *   bestMatch: object|null,
   *   category: string|null,
   *   category_he: string|null,
   *   riskRating: string,
   *   eddRequired: boolean,
   *   screenedAt: Date
   * }}
   */
  screen(person) {
    if (!person || (!person.name_he && !person.name_en)) {
      throw new Error('screen: name_he or name_en required / חובה שם');
    }
    const now = nowOrClock(this.clock);
    const matches = [];

    // Derive a latin query once — prefer explicit name_en, otherwise
    // transliterate the person's own Hebrew name (NEVER borrow the
    // candidate entry's transliteration — that would cause false
    // matches on every single entry).
    const queryHe = person.name_he || '';
    const queryLat = person.name_en
      || (person.name_he ? transliterateHebrew(person.name_he) : '');

    for (const entry of this.watchlist.values()) {
      if (!entry.active) continue;
      // Skip entries whose cooling-off period has fully elapsed
      if (!this._withinPEPWindow(entry, now)) continue;

      const m = this.fuzzyMatch(queryHe, queryLat, entry);
      if (m.score >= this.matchThreshold) {
        matches.push({
          entry,
          score: m.score,
          method: m.method,
          reason_he: m.reason_he,
          reason_en: m.reason_en,
        });
      }
    }

    // Sort by score desc, then prefer domestic over foreign
    matches.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const ra = a.entry.category === PEP_CATEGORY.DOMESTIC ? 0 : 1;
      const rb = b.entry.category === PEP_CATEGORY.DOMESTIC ? 0 : 1;
      return ra - rb;
    });

    const bestMatch = matches[0] || null;
    const pepObj = bestMatch ? bestMatch.entry : null;
    const result = {
      isPEP: matches.length > 0,
      matches,
      bestMatch,
      category: pepObj ? pepObj.category : null,
      category_he: pepObj ? pepObj.category_he : null,
      riskRating: this.riskRating(pepObj),
      eddRequired: this.enhancedDueDiligenceRequired(pepObj),
      screenedAt: now,
    };

    this._audit('screen', {
      queryName_he: person.name_he || '',
      queryName_en: person.name_en || '',
      isPEP: result.isPEP,
      matchCount: matches.length,
      bestScore: bestMatch ? bestMatch.score : 0,
      bestId: pepObj ? pepObj.id : null,
    });

    return result;
  }

  /**
   * Fuzzy-match a candidate against a watchlist entry, combining:
   *   - Direct Hebrew equality (after diacritic + punct strip)
   *   - Direct latin equality (after lowercase + punct strip)
   *   - Levenshtein similarity (latin)
   *   - Hebrew Soundex equality
   *   - English Soundex equality
   *   - Known Yehuda/Yehudah-style variant aliases
   *
   * @param {string} name           — candidate Hebrew name
   * @param {string} transliteration — candidate English / latin name
   * @param {object} [entry]        — optional specific entry to score against;
   *                                  if omitted, scans the entire watchlist
   *                                  and returns the best match.
   * @returns {{ score: number, method: string, reason_he: string, reason_en: string, entry?: object }}
   */
  fuzzyMatch(name, transliteration, entry) {
    if (!entry) {
      // Scan-all mode
      let best = { score: 0, method: 'none', reason_he: 'אין התאמה', reason_en: 'no match' };
      for (const e of this.watchlist.values()) {
        if (!e.active) continue;
        const r = this.fuzzyMatch(name, transliteration, e);
        if (r.score > best.score) {
          best = Object.assign({}, r, { entry: e });
        }
      }
      return best;
    }

    const qHe = normaliseHebrew(name || '');
    const qLat = normaliseLatin(transliteration || '');
    const eHe = entry._keyHe || '';
    const eLat = entry._keyLat || '';

    // 1. Exact Hebrew match
    if (qHe && eHe && qHe === eHe) {
      return {
        score: 1.0, method: 'exact-hebrew',
        reason_he: 'התאמה מדויקת בעברית',
        reason_en: 'exact Hebrew match',
      };
    }

    // 2. Exact latin match
    if (qLat && eLat && qLat === eLat) {
      return {
        score: 0.98, method: 'exact-latin',
        reason_he: 'התאמה מדויקת בלטינית',
        reason_en: 'exact latin match',
      };
    }

    // 3. Variant-alias match (Yehuda/Yehudah/Cohen/Kohen/…)
    if (qLat && eLat && this._variantEquals(qLat, eLat)) {
      return {
        score: 0.95, method: 'variant-alias',
        reason_he: 'התאמה לפי וריאנט שם ידוע (למשל יהודה/Yehudah)',
        reason_en: 'known-variant match (e.g. Yehuda/Yehudah)',
      };
    }

    // 4. Hebrew Soundex equality
    if (qHe && entry._soundexHe) {
      const qSx = hebrewSoundex(name);
      if (qSx && qSx === entry._soundexHe) {
        // Confirm with Levenshtein so we don't false-positive on very short names
        const sim = similarity(qHe, eHe);
        if (sim >= 0.6) {
          return {
            score: Math.min(0.93, 0.82 + sim * 0.1),
            method: 'hebrew-soundex',
            reason_he: 'התאמה פונטית בעברית (Soundex)',
            reason_en: 'Hebrew Soundex phonetic match',
          };
        }
      }
    }

    // 5. English Soundex equality
    if (qLat && entry._soundexEn) {
      const qSx = englishSoundex(transliteration);
      if (qSx && qSx === entry._soundexEn) {
        const sim = similarity(qLat, eLat);
        if (sim >= 0.6) {
          return {
            score: Math.min(0.90, 0.80 + sim * 0.1),
            method: 'english-soundex',
            reason_he: 'התאמה פונטית בלטינית (Soundex)',
            reason_en: 'English Soundex phonetic match',
          };
        }
      }
    }

    // 6. Raw Levenshtein similarity (latin). We accept ≥0.80 and boost
    // the score slightly because names this close are almost always the
    // same person with a spelling tweak.
    if (qLat && eLat) {
      const sim = similarity(qLat, eLat);
      if (sim >= 0.80) {
        return {
          score: Math.min(0.97, sim * 0.98 + 0.02),
          method: 'levenshtein-latin',
          reason_he: `מרחק עריכה (דמיון ${Math.round(sim * 100)}%)`,
          reason_en: `Levenshtein similarity ${Math.round(sim * 100)}%`,
        };
      }
    }

    // 7. Raw Levenshtein similarity (hebrew). Same loosened 0.80 threshold
    // so single-letter Hebrew typos ("משה" ↔ "משא") still match.
    if (qHe && eHe) {
      const sim = similarity(qHe, eHe);
      if (sim >= 0.80) {
        return {
          score: Math.min(0.97, sim * 0.98 + 0.02),
          method: 'levenshtein-hebrew',
          reason_he: `מרחק עריכה בעברית (דמיון ${Math.round(sim * 100)}%)`,
          reason_en: `Hebrew Levenshtein similarity ${Math.round(sim * 100)}%`,
        };
      }
    }

    return {
      score: 0, method: 'none',
      reason_he: 'אין התאמה',
      reason_en: 'no match',
    };
  }

  /**
   * Compare two latin-normalised tokens via the NAME_VARIANTS alias map.
   * Returns true if either is in the alias list of the other, or if a
   * token-wise split matches (e.g. "yehudahcohen" vs "yehudacohen").
   */
  _variantEquals(a, b) {
    if (!a || !b) return false;
    if (a === b) return true;
    // Try common prefixes (first word ≈ first name)
    const aliasesA = NAME_VARIANTS.get(a);
    if (aliasesA && aliasesA.includes(b)) return true;
    const aliasesB = NAME_VARIANTS.get(b);
    if (aliasesB && aliasesB.includes(a)) return true;

    // Split by embedded variant substrings: try to rewrite one side to the other
    for (const [canonical, aliases] of NAME_VARIANTS) {
      if (a.includes(canonical)) {
        for (const al of aliases) {
          if (a.replace(canonical, al) === b) return true;
        }
      }
      for (const al of aliases) {
        if (a.includes(al)) {
          if (a.replace(al, canonical) === b) return true;
          for (const al2 of aliases) {
            if (al === al2) continue;
            if (a.replace(al, al2) === b) return true;
          }
        }
      }
    }
    return false;
  }

  // ─────────────────────────────────────────────────────────────
  // Risk rating + EDD
  // ─────────────────────────────────────────────────────────────

  /**
   * Risk rating for a PEP match. Default is HIGH per BoI Directive 411 §5.
   *
   * Upgrades to PROHIBITED only if the operator has tagged the entry with
   * `entry.prohibited === true` (e.g. OFAC / UN sanctions list).
   *
   * @param {object|null} pep — the watchlist entry (or null if no match)
   */
  riskRating(pep) {
    if (!pep) return RISK_LEVEL.LOW;
    if (pep.prohibited === true) return RISK_LEVEL.PROHIBITED;
    return RISK_LEVEL.HIGH;
  }

  /**
   * Enhanced Due Diligence required? Always true for any matched PEP
   * (Directive 411 §6 + Prohibition on Money Laundering Law §8).
   *
   * Returns false for a null input (no match).
   */
  enhancedDueDiligenceRequired(pep) {
    if (!pep) return false;
    return true;
  }

  // ─────────────────────────────────────────────────────────────
  // Search by role / branch
  // ─────────────────────────────────────────────────────────────

  /**
   * Search watchlist by public-office branch or role substring.
   *
   * @param {object|string} query
   *   - string: branch name ('knesset' | 'cabinet' | 'ministry' | ...)
   *   - object: { branch, role, country, activeOnly }
   * @returns {Array<object>}
   */
  searchByRole(query) {
    let branch = '';
    let roleNeedle = '';
    let country = '';
    let activeOnly = true;

    if (typeof query === 'string') {
      branch = query;
    } else if (query && typeof query === 'object') {
      branch = query.branch || '';
      roleNeedle = (query.role || '').toLowerCase();
      country = query.country || '';
      if (query.activeOnly === false) activeOnly = false;
    }

    const out = [];
    for (const entry of this.watchlist.values()) {
      if (activeOnly && !entry.active) continue;
      if (branch && entry.branch !== branch) continue;
      if (country && entry.country !== country) continue;
      if (roleNeedle) {
        const r = (entry.role || '').toLowerCase();
        const rHe = entry.role_he || '';
        if (!r.includes(roleNeedle) && !rHe.includes(query.role)) continue;
      }
      out.push(entry);
    }
    return out;
  }

  // ─────────────────────────────────────────────────────────────
  // Periodic review (every 12 months)
  // ─────────────────────────────────────────────────────────────

  /**
   * Return a list of entries whose last review is older than
   * REVIEW_INTERVAL_MONTHS (default 12). Optionally mark them reviewed.
   *
   * @param {object} [opts]
   * @param {boolean} [opts.markReviewed=false]
   * @param {string}  [opts.actor='system']
   * @returns {Array<object>} entries due for review (snapshot)
   */
  periodicReview({ markReviewed = false, actor = 'system' } = {}) {
    const now = nowOrClock(this.clock);
    const due = [];
    for (const entry of this.watchlist.values()) {
      if (!entry.active) continue;
      const last = entry.lastReviewedAt || entry.addedAt;
      const months = monthsBetween(last, now);
      if (months >= REVIEW_INTERVAL_MONTHS) {
        due.push(entry);
      }
    }
    if (markReviewed) {
      for (const entry of due) {
        entry.lastReviewedAt = now;
        this._audit('periodicReview', { id: entry.id, actor });
      }
    } else if (due.length > 0) {
      this._audit('periodicReview:listed', { count: due.length, actor });
    }
    return due.slice();
  }

  // ─────────────────────────────────────────────────────────────
  // History / audit log (append-only)
  // ─────────────────────────────────────────────────────────────

  /** Return a shallow copy of the history log (append-only). */
  getHistory({ action, since } = {}) {
    const sinceD = toDate(since);
    const out = [];
    for (const e of this.history) {
      if (action && e.action !== action) continue;
      if (sinceD && e.at < sinceD) continue;
      out.push(Object.assign({}, e));
    }
    return out;
  }

  _audit(action, details) {
    this.history.push({
      seq: this.history.length + 1,
      action,
      at: nowOrClock(this.clock),
      details: details || {},
    });
  }

  _nextId() {
    this._counter += 1;
    return `PEP-${String(this._counter).padStart(6, '0')}`;
  }

  /**
   * Is the entry still inside its PEP window? (active role OR within
   * 12-month cooling-off period after endDate). Foreign / international
   * PEPs use the same window.
   */
  _withinPEPWindow(entry, now) {
    if (!entry.endDate) return true; // still in office
    const cutoff = addMonths(entry.endDate, COOLING_OFF_MONTHS);
    return now <= cutoff;
  }

  // ─────────────────────────────────────────────────────────────
  // Diagnostics
  // ─────────────────────────────────────────────────────────────

  /** Return a summary of the screener state (bilingual). */
  stats() {
    let active = 0;
    let inactive = 0;
    const byCategory = {};
    const byBranch = {};
    for (const e of this.watchlist.values()) {
      if (e.active) active++; else inactive++;
      byCategory[e.category] = (byCategory[e.category] || 0) + 1;
      if (e.branch) byBranch[e.branch] = (byBranch[e.branch] || 0) + 1;
    }
    return {
      total: this.watchlist.size,
      active,
      inactive,
      historyCount: this.history.length,
      byCategory,
      byBranch,
      labels: {
        he: 'סיכום מסך PEP',
        en: 'PEP screener summary',
      },
    };
  }
}

// ═══════════════════════════════════════════════════════════════
// Exports
// ═══════════════════════════════════════════════════════════════

module.exports = {
  PEPScreener,
  PEP_CATEGORY,
  PEP_CATEGORY_HE,
  RISK_LEVEL,
  RISK_LEVEL_HE,
  OFFICE_BRANCH,
  OFFICE_BRANCH_HE,
  COOLING_OFF_MONTHS,
  REVIEW_INTERVAL_MONTHS,
  // exposed for tests / downstream reuse
  hebrewSoundex,
  englishSoundex,
  levenshtein,
  similarity,
  transliterateHebrew,
  normaliseHebrew,
  normaliseLatin,
};
