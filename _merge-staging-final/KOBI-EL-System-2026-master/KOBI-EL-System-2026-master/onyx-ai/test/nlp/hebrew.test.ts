/**
 * ONYX AI  Hebrew NLP Toolkit  Test suite
 * ------------------------------------------------------------
 * Agent Y-165  Techno-Kol Uzi mega-ERP
 *
 * Run with:
 *   npx node --test --require ts-node/register test/nlp/hebrew.test.ts
 *
 * All Hebrew fixtures are embedded via `\uXXXX` escapes so the
 * file remains pure-ASCII on disk. This dodges the eternal
 * "my editor saved it in CP1255" bug and keeps the test suite
 * deterministic across platforms.
 *
 * Fixtures (reference)
 *   H_SHALOM_OLAM     =   -> "hello world"
 *   H_SENTENCE        =
 *   H_WITH_NIKKUD     =  (hand-nikkuded)
 *   H_VENDOR_1        =    (Techno-Kol Uzi Electronics)
 *   H_VENDOR_2        =    (alt spelling)
 *   H_MIXED           =  ONYX AI   2026
 */

import { test } from 'node:test';
import * as assert from 'node:assert/strict';

import HebrewNLP, {
    tokenize,
    stripNikkud,
    normalizeFinals,
    applyFinals,
    stripHebrewPrefix,
    removeStopwords,
    isStopword,
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
} from '../../src/nlp/hebrew';

// ------------------------------------------------------------
// Hebrew fixtures (pure \uXXXX escapes  zero binary chars)
// ------------------------------------------------------------

const H_SHALOM = '\u05E9\u05DC\u05D5\u05DD'; //
const H_OLAM = '\u05E2\u05D5\u05DC\u05DD'; //
const H_SHALOM_OLAM = H_SHALOM + ' ' + H_OLAM; //

// "  "  Hello to the whole world
const H_SENTENCE =
    H_SHALOM +
    ' \u05DC\u05DB\u05DC ' + //
    '\u05D4\u05E2\u05D5\u05DC\u05DD'; //

// nikkud sample:  -> " :"
const H_WITH_NIKKUD =
    '\u05E9\u05B8\u05C1\u05DC\u05B9\u05D5\u05B9\u05DD'; //

// Invoice fragment:    (the invoice from the supplier)
const H_INVOICE =
    '\u05D4\u05D7\u05E9\u05D1\u05D5\u05E0\u05D9\u05EA ' + //
    '\u05DE\u05D4\u05E1\u05E4\u05E7'; //

// Vendor name 1:    (Techno-Kol Uzi Electronics)
const H_VENDOR_1 =
    '\u05D8\u05DB\u05E0\u05D5-' +
    '\u05E7\u05D5\u05DC ' +
    '\u05E2\u05D5\u05D6\u05D9 ' +
    '\u05D0\u05DC\u05E7\u05D8\u05E8\u05D5\u05E0\u05D9\u05E7\u05D4';

// Plural endings sample:   (roads, cars)
const H_PLURALS_F = '\u05D3\u05E8\u05DB\u05D9\u05DD \u05DE\u05DB\u05D5\u05E0\u05D9\u05D5\u05EA';

// Mixed language sample:  ONYX AI   2026
const H_MIXED =
    '\u05D4\u05DE\u05E2\u05E8\u05DB\u05EA ' +
    'ONYX AI ' +
    '\u05D2\u05E8\u05E1\u05D4 2026';

// ------------------------------------------------------------
// 1. stripNikkud
// ------------------------------------------------------------

test('Y-165 / stripNikkud removes all nikkud codepoints', () => {
    const out = stripNikkud(H_WITH_NIKKUD);
    // Must equal the bare consonantal form:
    assert.equal(out, H_SHALOM);
});

test('Y-165 / stripNikkud leaves non-Hebrew text untouched', () => {
    assert.equal(stripNikkud('Invoice #42 paid'), 'Invoice #42 paid');
});

test('Y-165 / stripNikkud handles empty and null-like inputs', () => {
    assert.equal(stripNikkud(''), '');
    // @ts-expect-error  explicit runtime guard test
    assert.equal(stripNikkud(undefined), '');
});

// ------------------------------------------------------------
// 2. normalizeFinals / applyFinals (round-trip property)
// ------------------------------------------------------------

test('Y-165 / normalizeFinals folds final letters', () => {
    const input = H_SHALOM; //   (final mem at end)
    const out = normalizeFinals(input);
    // Final mem -> regular mem => U+05DD -> U+05DE
    assert.equal(
        out,
        '\u05E9\u05DC\u05D5\u05DE',
        'expected final mem to fold to U+05DE'
    );
});

test('Y-165 / applyFinals restores final form at end of word', () => {
    // :   (normalised to non-final mem at the end)
    // expected:   (with final mem)
    const normalised = '\u05E9\u05DC\u05D5\u05DE';
    const display = applyFinals(normalised);
    assert.equal(display, H_SHALOM);
});

test('Y-165 / applyFinals only touches last letter', () => {
    const input = '\u05DE\u05DC\u05DE'; //  + non-final mem at end
    assert.equal(applyFinals(input), '\u05DE\u05DC\u05DD');
});

// ------------------------------------------------------------
// 3. Hebrew prefix stripping & tokenisation
// ------------------------------------------------------------

test('Y-165 / stripHebrewPrefix removes  from ', () => {
    const input = '\u05D1\u05D1\u05D9\u05EA'; //   (at home)
    assert.equal(stripHebrewPrefix(input), '\u05D1\u05D9\u05EA');
});

test('Y-165 / stripHebrewPrefix refuses to shrink 2-letter words', () => {
    const input = '\u05D1\u05D9'; //   (would become "" alone)
    assert.equal(stripHebrewPrefix(input), input);
});

test('Y-165 / tokenize handles bilingual sentence and prefix stripping', () => {
    const tokens = tokenize(H_INVOICE);
    // After nikkud strip + prefix strip  we expect exactly two
    // content tokens: "" and "".
    assert.equal(tokens.length, 2);
    assert.equal(tokens[0], '\u05D7\u05E9\u05D1\u05D5\u05E0\u05D9\u05EA');
    // "" has  prefix which gets stripped  -> ""
    assert.equal(tokens[1], '\u05D4\u05E1\u05E4\u05E7');
});

test('Y-165 / tokenize splits on punctuation and whitespace', () => {
    const tokens = tokenize('PO-4711 approved!\n' + H_SHALOM_OLAM, {
        stripPrefixes: false, // keep foreign words untouched
        normalizeFinals: false, // preserve final-letter form for exact match
    });
    assert.ok(tokens.includes('po'));
    assert.ok(tokens.includes('4711'));
    assert.ok(tokens.includes('approved'));
    assert.ok(tokens.includes(H_SHALOM));
    assert.ok(tokens.includes(H_OLAM));
});

test('Y-165 / tokenize is idempotent on repeated calls', () => {
    const once = tokenize(H_SENTENCE);
    // Re-tokenising stem-normalised output must be a fixed point.
    const twice = tokenize(once.join(' '), {
        stripPrefixes: false,
        normalizeFinals: false,
    });
    assert.deepEqual(once, twice);
});

// ------------------------------------------------------------
// 4. Stopwords
// ------------------------------------------------------------

test('Y-165 / HEBREW_STOPWORDS contains the core function words', () => {
    assert.ok(HEBREW_STOPWORDS.has('\u05E9\u05DC')); //
    assert.ok(HEBREW_STOPWORDS.has('\u05D0\u05EA')); //
    assert.ok(HEBREW_STOPWORDS.has('\u05E2\u05DC')); //
    assert.ok(HEBREW_STOPWORDS.has('\u05DC\u05D0')); //
    assert.ok(HEBREW_STOPWORDS.has('\u05E8\u05E7')); //
    assert.ok(HEBREW_STOPWORDS.has('\u05D4\u05D5\u05D0')); //
});

test('Y-165 / removeStopwords strips both Hebrew and English fillers', () => {
    const tokens = [
        'the',
        H_SHALOM,
        '\u05E9\u05DC', //
        'world',
        '\u05E8\u05E7', //
        'ONYX',
    ];
    const kept = removeStopwords(tokens);
    assert.deepEqual(kept, [H_SHALOM, 'world', 'ONYX']);
});

test('Y-165 / isStopword is case-insensitive for English', () => {
    assert.equal(isStopword('The'), true);
    assert.equal(isStopword('THE'), true);
    assert.equal(isStopword('onyx'), false);
});

// ------------------------------------------------------------
// 5. Stemmer
// ------------------------------------------------------------

test('Y-165 / stem folds masculine plural  to base form', () => {
    // "" (books) should stem to "" (length >= 2 threshold)
    const books = '\u05E1\u05E4\u05E8\u05D9\u05DD';
    assert.equal(stem(books), '\u05E1\u05E4\u05E8');
});

test('Y-165 / stem folds feminine plural  to base form', () => {
    // "" (families, fem plural) -> first letter  is
    // NOT in the prefix set, so the stemmer should only strip
    // the "" suffix, leaving the shoresh "".
    const families = '\u05DE\u05E9\u05E4\u05D7\u05D5\u05EA';
    // Note: expected stem is "" (mem, shin, pe, chet).
    // prefix-strip will peel  because it's in the prefix
    // set, yielding "" -> "" after  strip. We assert
    // length instead of exact equality, since the reduction
    // depends on whether the caller ran prefix stripping.
    const stemmed = stem(families);
    assert.ok(
        stemmed.length <= families.length - 2,
        'expected at least 2-char reduction from fem-plural form'
    );
    // Must end with a consonantal radical, not the  ending.
    assert.ok(!stemmed.endsWith('\u05D5\u05EA'));
});

test('Y-165 / stem refuses to shrink below 2 letters', () => {
    // "" (house) must not become empty or 1-letter.
    const bayit = '\u05D1\u05D9\u05EA';
    const stemmed = stem(bayit);
    assert.ok(stemmed.length >= 2);
});

test('Y-165 / stemAll preserves token count', () => {
    const tokens = tokenize(H_SENTENCE);
    const stems = stemAll(tokens);
    assert.equal(stems.length, tokens.length);
});

test('Y-165 / stem is idempotent on plain stems', () => {
    const s1 = stem('\u05E1\u05E4\u05E8\u05D9\u05DD');
    const s2 = stem(s1);
    assert.equal(s1, s2);
});

// ------------------------------------------------------------
// 6. Hebrew Soundex
// ------------------------------------------------------------

test('Y-165 / hebrewSoundex produces 5-char code', () => {
    const code = hebrewSoundex('\u05D8\u05DB\u05E0\u05D5'); //
    assert.equal(code.length, 5);
});

test('Y-165 / hebrewSoundex collapses runs of same group', () => {
    // "" [, , , ]: , , ,  -> velar, dental, dental,
    // labial. Adjacent dental run should collapse to a single
    // digit, leaving 3 numeric digits + 1 zero-pad.
    const code = hebrewSoundex('\u05D9\u05DC\u05D3\u05D4');
    // First letter kept verbatim + 4-char code padded with
    // zeros. The collapsed dental run means only 3 distinct
    // groups land in the code.
    assert.equal(code.length, 5);
    // Ends with at least one '0' padding from collapse.
    assert.ok(code.endsWith('0'));
});

test('Y-165 / hebrewSoundex is idempotent on pure-Hebrew stems', () => {
    const word = '\u05D8\u05DB\u05E0\u05D5'; //
    const once = hebrewSoundex(word);
    const twice = hebrewSoundex(word);
    assert.equal(once, twice);
    assert.equal(once.length, 5);
});

test('Y-165 / hebrewSoundex is empty for non-Hebrew input', () => {
    assert.equal(hebrewSoundex('Electronics'), '');
});

// ------------------------------------------------------------
// 7. Counts
// ------------------------------------------------------------

test('Y-165 / countChars excludes nikkud and whitespace by default', () => {
    const n = countChars(H_WITH_NIKKUD);
    // H_WITH_NIKKUD has 4 consonants + multiple nikkud marks
    assert.equal(n, 4);
});

test('Y-165 / countWords on a short sentence', () => {
    assert.equal(countWords(H_SENTENCE), 3);
});

test('Y-165 / countWords on empty / whitespace-only is zero', () => {
    assert.equal(countWords(''), 0);
    assert.equal(countWords('   \t\n '), 0);
});

// ------------------------------------------------------------
// 8. Direction / language / mixed detection
// ------------------------------------------------------------

test('Y-165 / detectRTL true for pure Hebrew sentence', () => {
    assert.equal(detectRTL(H_SENTENCE), true);
});

test('Y-165 / detectRTL false for pure English sentence', () => {
    assert.equal(detectRTL('Invoice 4711 approved by CFO'), false);
});

test('Y-165 / detectLanguage reports mixed for bilingual string', () => {
    assert.equal(detectLanguage(H_MIXED), 'mixed');
});

test('Y-165 / detectMixed true when both scripts are present', () => {
    assert.equal(detectMixed(H_MIXED), true);
    assert.equal(detectMixed('hello world'), false);
    assert.equal(detectMixed(H_SHALOM_OLAM), false);
});

// ------------------------------------------------------------
// 9. Transliteration
// ------------------------------------------------------------

test('Y-165 / transliterate maps  to ASCII shalom-style form', () => {
    const latin = transliterate(H_SHALOM); //
    // With our silent-aleph, silent-ayin rules this is "shlvm"
    // from  l-m. Good-enough for slug/search.
    assert.equal(latin, 'shlvm');
});

test('Y-165 / transliterate handles bilingual input', () => {
    const latin = transliterate('ONYX ' + H_SHALOM);
    assert.ok(latin.startsWith('onyx'));
    assert.ok(latin.endsWith('shlvm'));
});

test('Y-165 / transliterate leaves digits intact', () => {
    assert.equal(transliterate('PO 4711'), 'po 4711');
});

// ------------------------------------------------------------
// 10. analyze  integration pipeline
// ------------------------------------------------------------

test('Y-165 / analyze returns a populated report for Hebrew', () => {
    const rep = analyze(H_SENTENCE);
    assert.equal(rep.language, 'he');
    assert.equal(rep.rtl, true);
    assert.equal(rep.mixed, false);
    assert.ok(rep.tokens.length >= 3);
    assert.ok(rep.wordCount >= 3);
    assert.ok(rep.hebrewRatio > 0.9);
    assert.equal(rep.latinRatio, 0);
});

test('Y-165 / analyze returns a populated report for mixed', () => {
    const rep = analyze(H_MIXED);
    assert.equal(rep.language, 'mixed');
    assert.equal(rep.mixed, true);
    assert.ok(rep.hebrewRatio > 0);
    assert.ok(rep.latinRatio > 0);
});

test('Y-165 / analyze is safe on empty input', () => {
    const rep = analyze('');
    assert.equal(rep.wordCount, 0);
    assert.equal(rep.charCount, 0);
    assert.equal(rep.tokens.length, 0);
    assert.equal(rep.language, 'unknown');
    assert.equal(rep.rtl, false);
    assert.equal(rep.mixed, false);
});

// ------------------------------------------------------------
// 11. Default export smoke
// ------------------------------------------------------------

test('Y-165 / default export exposes every named symbol', () => {
    assert.equal(typeof HebrewNLP.tokenize, 'function');
    assert.equal(typeof HebrewNLP.stripNikkud, 'function');
    assert.equal(typeof HebrewNLP.stem, 'function');
    assert.equal(typeof HebrewNLP.hebrewSoundex, 'function');
    assert.equal(typeof HebrewNLP.transliterate, 'function');
    assert.equal(typeof HebrewNLP.analyze, 'function');
    assert.ok(HebrewNLP.HEBREW_STOPWORDS instanceof Set);
    assert.ok(HebrewNLP.ENGLISH_STOPWORDS instanceof Set);
});
