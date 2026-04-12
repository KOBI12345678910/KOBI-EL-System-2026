# AG-Y165 — Hebrew NLP Toolkit (`onyx-ai/src/nlp/hebrew.ts`)

**Agent:** Y-165
**System:** Techno-Kol Uzi mega-ERP → `onyx-ai`
**Date:** 2026-04-11
**Motto:** לא מוחקים רק משדרגים ומגדלים — *don't delete, only upgrade and grow*

---

## EN — Executive summary

A zero-dependency, pure rule-based Hebrew + English NLP toolkit for the Techno-Kol Uzi mega-ERP. It powers every text pipeline that touches Hebrew — search, NLQ, smart categorisation, vendor-name fuzzy match, audit-trail indexing, free-form user queries. The toolkit is bilingual by construction, deterministic, and idempotent.

**Scope delivered**

| Feature | Function | Notes |
| --- | --- | --- |
| Tokenisation | `tokenize(input, opts)` | Hebrew prefix stripping (ב/כ/ל/מ/ש/ה/ו), final-letter folding, nikkud stripping, Latin lowercase, punct-only drop. |
| Nikkud stripping | `stripNikkud(input)` | Removes U+0591..U+05C7 (vowel points + cantillation) and Hebrew punctuation (U+05BE, U+05C0, U+05C3, U+05C6, U+05F3, U+05F4). |
| Final-letter normalisation | `normalizeFinals` / `applyFinals` | ך→כ, ם→מ, ן→נ, ף→פ, ץ→צ. `applyFinals` is the inverse (display-time). |
| Prefix stripping | `stripHebrewPrefix(token)` | Strips one of nine inseparable prefixes, refuses to shrink below 2 letters. |
| Stopwords | `HEBREW_STOPWORDS`, `ENGLISH_STOPWORDS`, `isStopword`, `removeStopwords` | ~50 Hebrew + 60 English function words. |
| Morphology-lite stemmer | `stem`, `stemAll` | Prefix + longest-matching-suffix. Never shrinks below 2 letters. Idempotent. Non-Hebrew tokens are lowercased. |
| Hebrew Soundex | `hebrewSoundex(input)` | 5-char phonetic code by articulation point (labial/velar/dental/sibilant/liquid/laryngeal). First letter preserved. |
| Character count | `countChars(input, includeWhitespace?)` | Excludes nikkud. |
| Word count | `countWords(input)` | Whitespace-split, nikkud-safe. |
| RTL detection | `detectRTL(input, threshold=0.5)` | Ratio of Hebrew letters over total letters. |
| Language detection | `detectLanguage(input)` | Returns `'he' \| 'en' \| 'mixed' \| 'unknown'`. |
| Mixed script detection | `detectMixed(input, threshold=0.1)` | Both scripts present above the given ratio. |
| Transliteration | `transliterate(input)` | ISO 259-inspired lossy Hebrew → ASCII-Latin (URL-safe). |
| All-in-one | `analyze(input)` | Returns `AnalyzeResult` with tokens, stems, content words, counts, ratios, language, rtl, mixed. |

**Non-functional guarantees**

- Zero external runtime dependencies (uses only `node:test` + `node:assert/strict` in tests).
- Pure rule-based — no ML, no network calls, no dictionaries bundled.
- Deterministic — same input, same output, every time.
- Immutable — functions never mutate their argument.
- Idempotent — `tokenize(tokenize(x))`, `stem(stem(x))`, `hebrewSoundex(hebrewSoundex(x))` all stable on inputs where the pipeline has already run (verified by tests).
- Non-destructive — this module *adds* capability to `onyx-ai`. Nothing was deleted.

**Files**

- `onyx-ai/src/nlp/hebrew.ts` — 691 lines, ~18 public exports.
- `onyx-ai/test/nlp/hebrew.test.ts` — 37 tests, Hebrew fixtures as `\uXXXX` escapes.
- `_qa-reports/AG-Y165-hebrew-nlp.md` — this document.

---

## EN — Test results

```
$ npx node --test --require ts-node/register test/nlp/hebrew.test.ts
ℹ tests 37
ℹ pass 37
ℹ fail 0
ℹ skipped 0
ℹ duration_ms 1089.3
```

**Test categories**

1. `stripNikkud` — 3 tests (basic, Latin untouched, empty/undefined-safe).
2. `normalizeFinals` / `applyFinals` — 3 tests (fold, round-trip, last-letter-only).
3. Hebrew prefix & tokenise — 5 tests (ב prefix, safety threshold, bilingual sentence, punct split, idempotency).
4. Stopwords — 3 tests (core words present, bilingual removal, case-insensitive English).
5. Stemmer — 5 tests (masc plural ים, fem plural ות, ≥2-char floor, count preservation, idempotency).
6. Hebrew Soundex — 4 tests (5-char length, group collapse, non-Hebrew empty, idempotent).
7. Counts — 3 tests (nikkud excluded, sentence word count, empty input).
8. RTL / language / mixed — 4 tests (pure Hebrew, pure English, mixed label, detectMixed thresholds).
9. Transliteration — 3 tests (שלום → `shlvm`, bilingual, digits intact).
10. `analyze` integration — 3 tests (Hebrew, mixed, empty-safe).
11. Default export smoke — 1 test.

**Total: 37 tests** — exceeds the 20-test minimum.

---

## EN — Key design choices & known limitations

- **Prefix stripping is overeager by design.** Words like `משפחות` (families) or `שמלות` (dresses) start with a legitimate-looking one-letter prefix (`מ`, `ש`) and the rule-based stemmer cannot distinguish radical vs prefix without a lexicon. This is acceptable for search recall (we *want* `משפחה` and `מַשפחת-` to collide into the same bucket) but users who need dictionary accuracy should layer a lexicon on top. The test suite documents the contract rather than hiding the limitation.
- **Soundex buckets are by articulation point**, not transliteration. `ט` and `ת` both land in the dental group, even though modern Israeli pronunciation merges them with slightly different phonetics — correct behaviour for vendor-name search.
- **Transliteration drops `א` and `ע`** on purpose. Including them would create phantom vowels (`'shalom'` → `'shalowm'`) that break URL slug comparison.
- **`normalizeFinals` is a forward transformation by default in `tokenize`.** Call sites that need to preserve final-letter form for display must pass `{ normalizeFinals: false }`. The test suite covers both modes.

---

## HE — תקציר מנהלים

ערכת כלים לעיבוד שפה טבעית (NLP) לעברית + אנגלית, ללא תלויות חיצוניות, בנויה במאה אחוז על חוקים (rule-based), כחלק מ-`onyx-ai` של מערכת Techno-Kol Uzi mega-ERP. הערכה מפעילה כל צינור טקסט שנוגע בעברית: חיפוש, שאילתות NLP, סיווג חכם, התאמה מטושטשת של שמות ספקים, אינדוקס מסלול ביקורת (audit trail) ושאילתות משתמש חופשיות.

**מה מסופק**

- **טוקניזציה** (`tokenize`) — כולל קילוף תחיליות חד־אותיות של העברית (ב/כ/ל/מ/ש/ה/ו), הסרת ניקוד, ונרמול אותיות סופיות.
- **ניקוד** (`stripNikkud`) — מסיר את כל הטווח U+0591..U+05C7 ואת סימני הפיסוק העבריים.
- **אותיות סופיות** (`normalizeFinals` / `applyFinals`) — ך→כ, ם→מ, ן→נ, ף→פ, ץ→צ, והפונקציה ההפוכה ליישום בזמן תצוגה.
- **מילות עצירה** — רשימה עברית של ~50 ערכים (של, את, עם, על, אל, זה, זו, הוא, היא, אם, כי, לא, גם, רק, …) + רשימה אנגלית של ~60 ערכים.
- **Stemmer קל** — קילוף תחילית + קילוף סופית ארוכה ביותר, עצירה ב-2 אותיות מינימום, אידמפוטנטי.
- **Soundex עברי** — קוד פונטי בן 5 תווים, מבוסס מקום חיתוך (שפתי/חכי/שיני/שורק/נוזלי/גרוני).
- **ספירות** — `countChars` ללא ניקוד, `countWords` בטוח לניקוד.
- **זיהוי כיווניות ושפה** — `detectRTL`, `detectLanguage` (`he` / `en` / `mixed` / `unknown`), `detectMixed`.
- **תעתיק לטיני** (`transliterate`) — ברוח ISO 259 אך ל-ASCII בלבד (מתאים ל-slug וחיפוש).
- **פייפליין מלא** (`analyze`) — מחזיר `AnalyzeResult` עם כל הפריטים ביחד.

**ערובות**

- אפס תלויות חיצוניות ב-runtime.
- דטרמיניסטי, לא משנה את הקלט, אידמפוטנטי.
- דבקות במוטו: **לא מוחקים, רק משדרגים ומגדלים** — זהו מודול חדש שמוסיף יכולת ל-`onyx-ai`, שום קוד קיים לא נמחק.

**קבצים**

- `onyx-ai/src/nlp/hebrew.ts` — קוד המקור (691 שורות).
- `onyx-ai/test/nlp/hebrew.test.ts` — 37 בדיקות, מעל הסף הדרוש (20+).
- `_qa-reports/AG-Y165-hebrew-nlp.md` — מסמך זה.

---

## HE — תוצאות הבדיקות

```
$ npx node --test --require ts-node/register test/nlp/hebrew.test.ts
ℹ tests 37
ℹ pass 37
ℹ fail 0
ℹ skipped 0
ℹ duration_ms 1089.3
```

**קטגוריות בדיקה**

1. הסרת ניקוד — 3 בדיקות.
2. נרמול ושחזור אותיות סופיות — 3 בדיקות.
3. קילוף תחיליות עבריות וטוקניזציה — 5 בדיקות.
4. מילות עצירה — 3 בדיקות.
5. Stemmer — 5 בדיקות (רבים זכר ים, רבים נקבה ות, רצפת 2 אותיות, שמירת ספירה, אידמפוטנטיות).
6. Soundex עברי — 4 בדיקות.
7. ספירות — 3 בדיקות.
8. זיהוי כיווניות/שפה/ערבוב — 4 בדיקות.
9. תעתיק — 3 בדיקות.
10. אינטגרציית `analyze` — 3 בדיקות.
11. יצוא ברירת־מחדל — 1 בדיקה.

**סה"כ: 37 בדיקות, 0 כשלים.**

---

## HE — מגבלות מוכרות

- **קילוף תחיליות אגרסיבי במכוון.** מילים כמו `משפחות` או `שמלות` מתחילות באות שגם משמשת תחילית (`מ`, `ש`). ה-stemmer ללא לקסיקון לא יכול להבחין בין אות־שורש לאות־תחילית. זהו פשרה מקובלת ל-recall בחיפוש — אם יש צורך בדיוק מילוני, יש לכסות את המודול הזה בשכבת לקסיקון מעליו.
- **דליים ב-Soundex לפי מקום־חיתוך**, לא לפי הגייה ישראלית מודרנית. `ט` ו-`ת` נופלים לאותו דלי — דווקא התנהגות רצויה לחיפוש שמות ספקים.
- **התעתיק מפיל `א` ו-`ע`** במכוון, כדי למנוע תנועות פנטום שהורסות השוואת slug.
- **`normalizeFinals` פועלת כברירת מחדל ב-`tokenize`.** קוראים שצריכים לשמר את צורת האות הסופית חייבים להעביר `{ normalizeFinals: false }`.

---

## Acceptance (EN + HE)

- [x] 3 files delivered at the exact paths requested.
- [x] Zero external dependencies.
- [x] Pure rule-based, deterministic.
- [x] Bilingual (EN + HE throughout source + report).
- [x] 20+ tests with Hebrew fixtures → **37 tests, all green.**
- [x] `לא מוחקים רק משדרגים ומגדלים` — this is pure addition; no existing code removed.

**Status: GREEN — ready for merge.**
