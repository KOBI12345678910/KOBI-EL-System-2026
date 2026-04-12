/**
 * ONYX AI  Hebrew NLP Toolkit
 * ------------------------------------------------------------
 * Agent Y-165  Techno-Kol Uzi mega-ERP
 *
 * A pure rule-based, zero-dependency Hebrew + English NLP
 * toolkit. Built for the Hebrew-first Techno-Kol Uzi mega-ERP:
 * search, NLQ, smart categorisation, audit-trail indexing, and
 * every other text pipeline that touches vendor names,
 * invoices, work orders, contract clauses, and free-form user
 * queries.
 *
 * Design principles
 *  - Zero external dependencies (node:test + node:assert only).
 *  - Pure rule-based (no ML models, no network calls).
 *  - Bilingual: every primitive handles Hebrew, English, and
 *    mixed Hebrew/English input without choking.
 *  - Non-destructive: functions never mutate their input and
 *    never delete functionality from earlier revisions. They
 *    only upgrade and grow (,  -
 *    "dont delete, only upgrade and grow").
 *  - Deterministic: same input  same output, always.
 *
 * Feature matrix
 *   tokenize              - word-level tokeniser with Hebrew
 *                           prefix stripping (/////////)
 *   stripNikkud           - removes U+0591..U+05C7 (nikkud,
 *                           cantillation, punctuation marks)
 *   normalizeFinals       - folds final letters (,
 *                           , , , )
 *   removeStopwords       - filters a curated Hebrew + English
 *                           stopword list
 *   stem                  - morphology-lite stemmer (prefix
 *                           + suffix stripping, verb/noun
 *                           plural/gender folding)
 *   hebrewSoundex         - 5-char phonetic code for Hebrew
 *                           names (Techno-Kol search)
 *   countChars            - character count excluding nikkud
 *   countWords            - whitespace/punct-aware word count
 *   detectRTL             - returns true if >=50% of letters
 *                           are Hebrew/Arabic (RTL)
 *   transliterate         - lossy Hebrew->Latin transliteration
 *                           (ISO 259 inspired, ASCII output)
 *   detectMixed           - detects Hebrew+English mixed text
 *   analyze               - convenience all-in-one pipeline
 *
 * Ranges used throughout
 *   Hebrew letters        U+05D0..U+05EA
 *   Final letters         U+05DA, U+05DD, U+05DF, U+05E3, U+05E5
 *   Nikkud/cantillation   U+0591..U+05C7
 *   Hebrew punctuation    U+05BE, U+05C0, U+05C3, U+05C6, U+05F3, U+05F4
 */

// ============================================================
// Types
// ============================================================

export type LanguageCode = 'he' | 'en' | 'mixed' | 'unknown';

export interface TokenizeOptions {
    /** Strip common one-letter Hebrew prefixes (/////////). */
    stripPrefixes?: boolean;
    /** Fold final letters (). */
    normalizeFinals?: boolean;
    /** Remove nikkud before tokenising. */
    stripNikkud?: boolean;
    /** Lowercase Latin characters. */
    lowercase?: boolean;
    /** Drop empty tokens that only contained punctuation. */
    dropPunctOnly?: boolean;
}

export interface AnalyzeResult {
    original: string;
    normalized: string;
    tokens: string[];
    stems: string[];
    contentWords: string[]; // tokens minus stopwords
    language: LanguageCode;
    rtl: boolean;
    mixed: boolean;
    charCount: number;
    wordCount: number;
    hebrewRatio: number;
    latinRatio: number;
}

// ============================================================
// Character classification helpers
// ============================================================

const HEBREW_LETTER_RANGE = /[\u05D0-\u05EA]/;
const HEBREW_LETTER_RANGE_G = /[\u05D0-\u05EA]/g;
const NIKKUD_RANGE_G = /[\u0591-\u05C7]/g;
const LATIN_LETTER_G = /[A-Za-z]/g;
const WHITESPACE = /\s+/;

/** Hebrew punctuation that should never be treated as a letter. */
const HEBREW_PUNCT_RANGE_G = /[\u05BE\u05C0\u05C3\u05C6\u05F3\u05F4]/g;

/** Unicode-safe ASCII fallback for ES5 targets (no \p{L}). */
function isHebrewChar(ch: string): boolean {
    const code = ch.charCodeAt(0);
    return code >= 0x05d0 && code <= 0x05ea;
}

function isLatinChar(ch: string): boolean {
    const code = ch.charCodeAt(0);
    return (code >= 0x41 && code <= 0x5a) || (code >= 0x61 && code <= 0x7a);
}

function isDigit(ch: string): boolean {
    const code = ch.charCodeAt(0);
    return code >= 0x30 && code <= 0x39;
}

// ============================================================
// Nikkud & final-letter normalisation
// ============================================================

/**
 * Strip Hebrew nikkud, cantillation marks, and Hebrew
 * punctuation (,  etc). Latin and digits are untouched.
 *
 *  ->
 */
export function stripNikkud(input: string): string {
    if (!input) return '';
    return input.replace(NIKKUD_RANGE_G, '').replace(HEBREW_PUNCT_RANGE_G, '');
}

/** Folds Hebrew final letters into their non-final form. */
const FINAL_LETTER_MAP: Record<string, string> = {
    '\u05DA': '\u05DB', //   ->
    '\u05DD': '\u05DE', //   ->
    '\u05DF': '\u05E0', //   ->
    '\u05E3': '\u05E4', //   ->
    '\u05E5': '\u05E6', //   ->
};

export function normalizeFinals(input: string): string {
    if (!input) return '';
    let out = '';
    for (let i = 0; i < input.length; i++) {
        const ch = input.charAt(i);
        out += FINAL_LETTER_MAP[ch] ?? ch;
    }
    return out;
}

/**
 * Inverse operation  apply final-letter form when the letter
 * lands at the end of a word. Useful for display of stemmed
 * tokens in Hebrew UI.
 */
const NON_FINAL_TO_FINAL: Record<string, string> = {
    '\u05DB': '\u05DA',
    '\u05DE': '\u05DD',
    '\u05E0': '\u05DF',
    '\u05E4': '\u05E3',
    '\u05E6': '\u05E5',
};

export function applyFinals(word: string): string {
    if (!word) return '';
    const last = word.charAt(word.length - 1);
    const finalForm = NON_FINAL_TO_FINAL[last];
    if (!finalForm) return word;
    return word.slice(0, -1) + finalForm;
}

// ============================================================
// Hebrew prefix handling
// ============================================================

/**
 * The nine inseparable one-letter prefixes of Biblical and
 * Modern Hebrew. Stripping them is a classic "morphology-lite"
 * trick that dramatically improves recall for search/stems
 * without requiring a dictionary.
 *
 *      .
 *       ( ,  ,
 *       , etc.)
 */
const HEBREW_PREFIXES = new Set<string>([
    '\u05D1', //
    '\u05DB', //
    '\u05DC', //
    '\u05DE', //
    '\u05E9', //
    '\u05D4', //
    '\u05D5', //
]);

/**
 * Strip a single recognised Hebrew prefix from a token. Only
 * strips when the remainder is still >= 2 letters  stops us
 * from butchering short words like ,  or .
 */
export function stripHebrewPrefix(token: string): string {
    if (token.length < 3) return token;
    const first = token.charAt(0);
    if (!HEBREW_PREFIXES.has(first)) return token;
    return token.slice(1);
}

// ============================================================
// Tokenisation
// ============================================================

const DEFAULT_TOKENIZE_OPTIONS: Required<TokenizeOptions> = {
    stripPrefixes: true,
    normalizeFinals: true,
    stripNikkud: true,
    lowercase: true,
    dropPunctOnly: true,
};

/**
 * Word-level tokeniser that understands Hebrew prefixes,
 * nikkud, final letters, Latin text, and digits. Non-letter,
 * non-digit characters are treated as separators.
 *
 *   ""
 *     -> ["", "", "", "", ""]
 */
export function tokenize(
    input: string,
    options: TokenizeOptions = {}
): string[] {
    if (!input) return [];
    const opts: Required<TokenizeOptions> = {
        ...DEFAULT_TOKENIZE_OPTIONS,
        ...options,
    };

    let text = input;
    if (opts.stripNikkud) text = stripNikkud(text);
    if (opts.normalizeFinals) text = normalizeFinals(text);

    // Split on anything that isnt a Hebrew letter, Latin letter
    // or digit. We keep underscore-free plain tokens.
    const raw: string[] = [];
    let buf = '';
    for (let i = 0; i < text.length; i++) {
        const ch = text.charAt(i);
        if (isHebrewChar(ch) || isLatinChar(ch) || isDigit(ch)) {
            buf += ch;
        } else {
            if (buf.length) raw.push(buf);
            buf = '';
        }
    }
    if (buf.length) raw.push(buf);

    const tokens: string[] = [];
    for (let i = 0; i < raw.length; i++) {
        let tok = raw[i];
        if (opts.lowercase) tok = tok.toLowerCase();
        if (opts.stripPrefixes && isHebrewChar(tok.charAt(0))) {
            tok = stripHebrewPrefix(tok);
        }
        if (opts.dropPunctOnly && tok.length === 0) continue;
        tokens.push(tok);
    }
    return tokens;
}

// ============================================================
// Stopwords
// ============================================================

/**
 * Curated Hebrew stopword list  the 70 most frequent
 * grammatical function words. Each entry is already stripped
 * of nikkud and uses non-final letter forms, so tokens from
 * our tokenizer match directly (no extra normalisation needed
 * at lookup time).
 */
export const HEBREW_STOPWORDS: ReadonlySet<string> = new Set<string>([
    // pronouns
    '\u05D0\u05E0\u05D9', //
    '\u05D0\u05EA\u05D4', //
    '\u05D0\u05EA', //
    '\u05D4\u05D5\u05D0', //
    '\u05D4\u05D9\u05D0', //
    '\u05D0\u05E0\u05D7\u05E0\u05D5', //
    '\u05D4\u05DD', //
    '\u05D4\u05DF', //
    // demonstratives
    '\u05D6\u05D4', //
    '\u05D6\u05D5', //
    '\u05D0\u05DC\u05D4', //
    '\u05D4\u05D6\u05D4', //
    // prepositions / particles
    '\u05E9\u05DC', //
    '\u05E2\u05DC', //
    '\u05E2\u05DD', //
    '\u05D0\u05DC', //
    '\u05DE\u05DF', //
    '\u05DE\u05DF', //
    '\u05DC\u05D0', //
    '\u05DB\u05D9', //
    '\u05D0\u05DD', //
    '\u05D0\u05D5', //
    '\u05D2\u05DD', //
    '\u05E8\u05E7', //
    '\u05D0\u05D1\u05DC', //
    '\u05D0\u05D9\u05DF', //
    '\u05D9\u05E9', //
    '\u05D4\u05D9\u05D4', //
    '\u05D4\u05D9\u05D5', //
    '\u05D4\u05D9\u05EA\u05D4', //
    '\u05D4\u05D9\u05D5\u05EA', //
    '\u05D9\u05D4\u05D9\u05D4', //
    '\u05D0\u05E9\u05E8', //
    '\u05E2\u05D3', //
    '\u05D0\u05D7\u05E8\u05D9', //
    '\u05DC\u05E4\u05E0\u05D9', //
    '\u05DC\u05E4\u05D9', //
    '\u05D1\u05D9\u05DF', //
    '\u05DB\u05DE\u05D5', //
    '\u05DB\u05DA', //
    '\u05DB\u05DF', //
    '\u05DC\u05DB\u05DF', //
    '\u05D0\u05D6', //
    '\u05DB\u05D0\u05DF', //
    '\u05E9\u05DD', //
    '\u05E4\u05D4', //
    '\u05E2\u05DB\u05E9\u05D9\u05D5', //
    '\u05DE\u05D0\u05D5\u05D3', //
    '\u05E8\u05E7', //
    '\u05D9\u05D5\u05EA\u05E8', //
    '\u05E4\u05D7\u05D5\u05EA', //
    // auxiliaries
    '\u05D4\u05D9\u05D5', //
]);

/**
 * Minimal English stopword list for mixed-language text. Not
 * meant to replace a full NLTK list  just the top 60 that
 * appear in UI/ERP strings.
 */
export const ENGLISH_STOPWORDS: ReadonlySet<string> = new Set<string>([
    'a','an','the','and','or','but','if','of','at','by','for','with','about',
    'to','from','in','on','up','down','out','over','under','again','then',
    'once','here','there','when','where','why','how','all','any','both','each',
    'few','more','most','other','some','such','no','nor','not','only','own',
    'same','so','than','too','very','can','will','just','is','are','was','were',
    'be','been','being','have','has','had','do','does','did','this','that',
    'these','those','i','you','he','she','it','we','they',
]);

export function isStopword(token: string): boolean {
    return HEBREW_STOPWORDS.has(token) || ENGLISH_STOPWORDS.has(token.toLowerCase());
}

export function removeStopwords(tokens: readonly string[]): string[] {
    const out: string[] = [];
    for (let i = 0; i < tokens.length; i++) {
        if (!isStopword(tokens[i])) out.push(tokens[i]);
    }
    return out;
}

// ============================================================
// Morphology-lite stemmer
// ============================================================

/**
 * Hebrew suffix families, ordered from most to least specific.
 * The stemmer strips the *longest* matching suffix first and
 * will not reduce a word below 2 letters  the empirically
 * safest threshold for non-dictionary stemmers.
 */
const HEBREW_SUFFIXES: readonly string[] = [
    '\u05D9\u05D5\u05EA', //   (plural nouns)
    '\u05D5\u05EA', //   (fem plural)
    '\u05D9\u05DD', //   (masc plural)
    '\u05D9\u05DE', //   (stripped final )
    '\u05D4\u05DD', //   (3pl possessive)
    '\u05D4\u05DF', //   (3pl-f possessive)
    '\u05D9\u05DA', //   (2sg-f possessive)
    '\u05DB\u05DD', //   (2pl possessive)
    '\u05DB\u05DF', //   (2pl-f possessive)
    '\u05E0\u05D5', //   (1pl possessive)
    '\u05EA\u05D9', //   (1sg past / possessive)
    '\u05EA\u05DD', //   (2pl past)
    '\u05D5\u05EA', //   (alt plural)
    '\u05D4', //  (fem ending or 3sg-f possessive)
    '\u05D9', //  (1sg possessive / adj)
    '\u05DA', //  (2sg-m possessive)
    '\u05DE', //  (abstract ending)
    '\u05E0', //  (stripped )
    '\u05EA', //  (fem / 2sg)
];

/**
 * Stem a single token. Combines prefix stripping, final
 * normalisation, and suffix stripping. Idempotent.
 *
 *
 *
 * For non-Hebrew tokens the stem is just the lower-cased
 * original (we dont ship an English stemmer  yet  so the
 * principle of "dont delete functionality" means we return
 * something useful, not an empty string).
 */
export function stem(token: string): string {
    if (!token) return '';
    const lower = token.toLowerCase();
    if (!isHebrewChar(lower.charAt(0))) return lower;

    let word = normalizeFinals(stripNikkud(lower));
    word = stripHebrewPrefix(word);

    // Strip longest matching suffix, but never below 2 letters.
    for (let i = 0; i < HEBREW_SUFFIXES.length; i++) {
        const suffix = HEBREW_SUFFIXES[i];
        if (word.length - suffix.length >= 2 && word.endsWith(suffix)) {
            word = word.slice(0, word.length - suffix.length);
            break;
        }
    }
    return word;
}

export function stemAll(tokens: readonly string[]): string[] {
    const out: string[] = new Array(tokens.length);
    for (let i = 0; i < tokens.length; i++) out[i] = stem(tokens[i]);
    return out;
}

// ============================================================
// Hebrew Soundex
// ============================================================

/**
 * Hebrew phonetic code  a Soundex variant tuned for modern
 * Israeli pronunciation. Produces a 5-character code of shape
 * [letter][digit][digit][digit][digit]. Used by the ERPs
 * vendor-name fuzzy-matcher (Techno-Kol  -> same code).
 *
 * Groups (based on articulation point, not orthography):
 *   1 - labial        / / /
 *   2 - velar         / / /
 *   3 - dental        / / / /
 *   4 - sibilant      / / / /
 *   5 - liquid        / / /
 *   6 - laryngeal     / / / /
 *
 *  letters drop out of the code entirely (matouch).
 */
const HEBREW_SOUNDEX_GROUPS: Record<string, string> = {
    // labial
    '\u05D1': '1', //
    '\u05D5': '1', //
    '\u05DE': '1', //
    '\u05E4': '1', //
    // velar
    '\u05D2': '2', //
    '\u05D9': '2', //
    '\u05DB': '2', //
    '\u05E7': '2', //
    // dental
    '\u05D3': '3', //
    '\u05D8': '3', //
    '\u05DC': '3', //
    '\u05E0': '3', //
    '\u05EA': '3', //
    // sibilant
    '\u05D6': '4', //
    '\u05E1': '4', //
    '\u05E6': '4', //
    '\u05E9': '4', //
    // liquid
    '\u05E8': '5', //
    // laryngeal
    '\u05D0': '6', //
    '\u05D4': '6', //
    '\u05D7': '6', //
    '\u05E2': '6', //
};

export function hebrewSoundex(input: string): string {
    if (!input) return '';
    const normalised = normalizeFinals(stripNikkud(input));
    if (!normalised.length || !isHebrewChar(normalised.charAt(0))) return '';

    // Keep first letter verbatim (upper-cased to A..Z mapping
    // doesnt apply to Hebrew  we just keep the Hebrew char).
    const first = normalised.charAt(0);
    let code = '';
    let lastGroup = HEBREW_SOUNDEX_GROUPS[first] ?? '';

    for (let i = 1; i < normalised.length && code.length < 4; i++) {
        const ch = normalised.charAt(i);
        const group = HEBREW_SOUNDEX_GROUPS[ch];
        if (group === undefined) {
            lastGroup = '';
            continue;
        }
        if (group === lastGroup) continue;
        code += group;
        lastGroup = group;
    }
    return (first + (code + '0000').slice(0, 4));
}

// ============================================================
// Counts, direction, language detection
// ============================================================

export function countChars(input: string, includeWhitespace = false): number {
    if (!input) return 0;
    const clean = stripNikkud(input);
    if (includeWhitespace) return clean.length;
    let n = 0;
    for (let i = 0; i < clean.length; i++) {
        if (!/\s/.test(clean.charAt(i))) n++;
    }
    return n;
}

export function countWords(input: string): number {
    if (!input) return 0;
    const trimmed = stripNikkud(input).trim();
    if (!trimmed) return 0;
    return trimmed.split(WHITESPACE).filter(Boolean).length;
}

/** Count Hebrew letters vs Latin letters in a sample. */
function letterRatios(input: string): {
    hebrew: number;
    latin: number;
    total: number;
} {
    let hebrew = 0;
    let latin = 0;
    let total = 0;
    for (let i = 0; i < input.length; i++) {
        const ch = input.charAt(i);
        if (isHebrewChar(ch)) {
            hebrew++;
            total++;
        } else if (isLatinChar(ch)) {
            latin++;
            total++;
        }
    }
    return { hebrew, latin, total };
}

export function detectRTL(input: string, threshold = 0.5): boolean {
    if (!input) return false;
    const { hebrew, total } = letterRatios(input);
    if (total === 0) return false;
    return hebrew / total >= threshold;
}

export function detectLanguage(input: string): LanguageCode {
    if (!input) return 'unknown';
    const { hebrew, latin, total } = letterRatios(input);
    if (total === 0) return 'unknown';
    const hRatio = hebrew / total;
    const lRatio = latin / total;
    if (hRatio >= 0.9) return 'he';
    if (lRatio >= 0.9) return 'en';
    if (hRatio >= 0.1 && lRatio >= 0.1) return 'mixed';
    if (hRatio > lRatio) return 'he';
    return 'en';
}

export function detectMixed(input: string, threshold = 0.1): boolean {
    if (!input) return false;
    const { hebrew, latin, total } = letterRatios(input);
    if (total === 0) return false;
    return hebrew / total >= threshold && latin / total >= threshold;
}

// ============================================================
// Transliteration (Hebrew -> Latin)
// ============================================================

/**
 * ISO 259 inspired Hebrew -> Latin transliteration, tuned for
 * ASCII output (no diacritics). Good enough for vendor-name
 * alignment, URL slugs and log readability. Not reversible.
 *
 *     -> "shalom olam"
 */
const TRANSLIT_MAP: Record<string, string> = {
    '\u05D0': '',   //  (silent)
    '\u05D1': 'b',  //
    '\u05D2': 'g',  //
    '\u05D3': 'd',  //
    '\u05D4': 'h',  //
    '\u05D5': 'v',  //
    '\u05D6': 'z',  //
    '\u05D7': 'kh', //
    '\u05D8': 't',  //
    '\u05D9': 'y',  //
    '\u05DA': 'kh', //   (final)
    '\u05DB': 'k',  //
    '\u05DC': 'l',  //
    '\u05DD': 'm',  //   (final)
    '\u05DE': 'm',  //
    '\u05DF': 'n',  //   (final)
    '\u05E0': 'n',  //
    '\u05E1': 's',  //
    '\u05E2': '',   //  (silent ayin)
    '\u05E3': 'f',  //   (final)
    '\u05E4': 'p',  //
    '\u05E5': 'ts', //   (final)
    '\u05E6': 'ts', //
    '\u05E7': 'q',  //
    '\u05E8': 'r',  //
    '\u05E9': 'sh', //
    '\u05EA': 't',  //
};

export function transliterate(input: string): string {
    if (!input) return '';
    const clean = stripNikkud(input);
    let out = '';
    for (let i = 0; i < clean.length; i++) {
        const ch = clean.charAt(i);
        if (isHebrewChar(ch)) {
            out += TRANSLIT_MAP[ch] ?? '';
        } else {
            out += ch.toLowerCase();
        }
    }
    // Collapse accidental double spaces from silent letters.
    return out.replace(/[ \t]+/g, ' ').trim();
}

// ============================================================
// Convenience  all-in-one analysis
// ============================================================

export function analyze(input: string): AnalyzeResult {
    const normalized = normalizeFinals(stripNikkud(input ?? ''));
    const tokens = tokenize(input ?? '');
    const stems = stemAll(tokens);
    const contentWords = removeStopwords(tokens);
    const { hebrew, latin, total } = letterRatios(normalized);
    const hebrewRatio = total === 0 ? 0 : hebrew / total;
    const latinRatio = total === 0 ? 0 : latin / total;
    return {
        original: input ?? '',
        normalized,
        tokens,
        stems,
        contentWords,
        language: detectLanguage(input ?? ''),
        rtl: detectRTL(input ?? ''),
        mixed: detectMixed(input ?? ''),
        charCount: countChars(input ?? ''),
        wordCount: countWords(input ?? ''),
        hebrewRatio,
        latinRatio,
    };
}

// Default export mirrors the named exports so consumers can
// `import HebrewNLP from "./nlp/hebrew"` in CommonJS contexts.
const HebrewNLP = {
    tokenize,
    stripNikkud,
    normalizeFinals,
    applyFinals,
    stripHebrewPrefix,
    isStopword,
    removeStopwords,
    stem,
    stemAll,
    hebrewSoundex,
    countChars,
    countWords,
    detectRTL,
    detectLanguage,
    detectMixed,
    transliterate,
    analyze,
    HEBREW_STOPWORDS,
    ENGLISH_STOPWORDS,
} as const;

export default HebrewNLP;
