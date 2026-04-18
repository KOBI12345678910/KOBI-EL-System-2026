# AG-Y147 — PEP Screener / סינון אנשי ציבור (איסור הלבנת הון)

**Status:** PASS (19/19 tests green)
**Date:** 2026-04-11
**Agent:** Y-147
**Module:** `onyx-procurement/src/compliance/pep-screener.js`
**Tests:** `onyx-procurement/test/compliance/pep-screener.test.js`
**Framework:** `node --test` (zero-dep, Node built-ins only)
**Rule enforced:** לא מוחקים רק משדרגים ומגדלים (never delete — only upgrade and grow)

---

## 1. Purpose / מטרה

Screen third parties (suppliers, customers, beneficial owners, signatories)
against a Politically Exposed Persons (PEP) watchlist, as required by:

- **חוק איסור הלבנת הון, התש״ס–2000** (Prohibition on Money Laundering Law, 5760-2000)
- **תקנות איסור הלבנת הון** issued by the Ministry of Justice
- **הוראת ניהול בנקאי תקין 411** (Bank of Israel Directive 411, Customer Due Diligence)
- **FATF Recommendation 12** (Politically Exposed Persons)
- **רשות איסור הלבנת הון ומימון טרור** guidance

Every positive match triggers Enhanced Due Diligence (EDD) and raises
risk rating to **HIGH** (or **PROHIBITED** if the entry is additionally
flagged on an OFAC/UN list).

The module is the single point of truth for PEP status across onyx-procurement
(suppliers, contracts, invoices, payments) and onyx-ai bridge consumers.

## 2. PEP Categories / קטגוריות

| Code                  | HE                   | Examples (non-exhaustive)                                                     |
|-----------------------|----------------------|-------------------------------------------------------------------------------|
| `domestic`            | איש ציבור מקומי      | חברי כנסת, שרים, שופטים, אלופים, מפכ״ל, שגרירים, מנכ״לי חברות ממשלתיות       |
| `foreign`             | איש ציבור זר         | ראשי מדינות, שרים, פרלמנטרים, שופטים בכירים של מדינות זרות                   |
| `international-org`   | ארגון בינלאומי       | סגני מזכ״ל האו״ם, נציגי EU/OECD/WTO בכירים                                    |
| `family-member`       | בן משפחה             | בני זוג, הורים, ילדים, אחים מדרגה ראשונה                                      |
| `close-associate`     | מקורב                | שותפים עסקיים, חשבונות משותפים, בעלי חתימה, נאמנויות משותפות                  |

Additional role dimension (`branch`): `knesset`, `cabinet`, `ministry`,
`judiciary`, `idf-senior`, `police-senior`, `diplomacy`, `state-owned-co`,
`municipality`, `bank-of-israel`.

## 3. Public API

```js
const { PEPScreener, PEP_CATEGORY, RISK_LEVEL, OFFICE_BRANCH }
  = require('onyx-procurement/src/compliance/pep-screener');

const screener = new PEPScreener({
  matchThreshold: 0.82,        // similarity cutoff, default 0.82
  clock: () => new Date(),     // injectable for tests
  seed: [ /* pre-seeded entries */ ],
});
```

### Watchlist CRUD (append-only)
- `addWatchlist(entry)` — validates category + branch, auto-transliterates
  missing `name_en`, pre-computes Hebrew + English Soundex keys for O(1)
  lookup, audit-logs the event.
- `removeWatchlist({ id, actor, reason })` — **does not delete**. Marks
  the record inactive (`active: false`), stamps `deactivatedAt`,
  `deactivatedBy`, `deactivationReason`, and audit-logs the event. The
  entry stays retrievable via `getEntry(id)` and
  `getAllEntries({ includeInactive: true })`.
- `getEntry(id)` — single lookup including inactive entries.
- `getAllEntries({ includeInactive })` — list form.

### Screening
- `screen(person)` — returns
  ```
  {
    isPEP,         // boolean
    matches: [{ entry, score, method, reason_he, reason_en }, ...],
    bestMatch,     // top match or null
    category,      // PEP_CATEGORY.* or null
    category_he,   // Hebrew label
    riskRating,    // RISK_LEVEL.* (default HIGH on any match)
    eddRequired,   // boolean (true iff match)
    screenedAt,    // Date
  }
  ```
  Uses the injected clock, filters out entries past their 12-month
  cooling-off window, sorts matches by score (prefers `domestic` on ties),
  and audit-logs every invocation (query + result summary).
- `fuzzyMatch(name, transliteration, entry?)` — core name-matching engine.
  Scores a candidate against a single entry or scans the whole watchlist
  if `entry` is omitted.

### Risk + EDD
- `riskRating(pep)` — `LOW` when null; `HIGH` by default for any match;
  `PROHIBITED` only if the entry is additionally flagged
  (`entry.prohibited === true`).
- `enhancedDueDiligenceRequired(pep)` — `true` for any non-null PEP,
  `false` for null.

### Search + periodic review
- `searchByRole(query)` — query can be a plain branch string
  (`'knesset'`, `'judiciary'`, `'idf-senior'`, ...) or an object
  `{ branch, role, country, activeOnly }`.
- `periodicReview({ markReviewed, actor })` — returns entries whose
  `lastReviewedAt` is ≥ 12 months stale. With `markReviewed:true` it
  stamps `lastReviewedAt = now` and audit-logs one entry per review.

### History
- `getHistory({ action, since })` — append-only audit trail; returns
  a **shallow copy** so callers can't mutate it.

### Diagnostics
- `stats()` — `{ total, active, inactive, historyCount, byCategory,
  byBranch, labels: { he, en } }`.

## 4. Name Matching Pipeline / צינור התאמת שמות

Each candidate is scored through a deterministic cascade; first rule
above `matchThreshold` wins.

| # | Method                  | Purpose                                                    |
|---|-------------------------|------------------------------------------------------------|
| 1 | `exact-hebrew`          | Literal Hebrew equality after diacritic + punctuation strip |
| 2 | `exact-latin`           | Literal latin equality after lowercase + punctuation strip |
| 3 | `variant-alias`         | Yehuda ↔ Yehudah ↔ Jehuda ↔ Judah, Cohen ↔ Kohen, Moshe ↔ Moishe, Binyamin ↔ Benjamin, etc. (17-entry seed map, never shrinks) |
| 4 | `hebrew-soundex`        | Hebrew Soundex equality + Levenshtein confirmation (≥0.6)   |
| 5 | `english-soundex`       | English Soundex (Russell 1918) + Levenshtein confirmation   |
| 6 | `levenshtein-latin`     | Similarity ≥ 0.80 on normalised latin form                  |
| 7 | `levenshtein-hebrew`    | Similarity ≥ 0.80 on normalised Hebrew form                 |

### Hebrew Soundex groups
```
1 — ב ו פ ף                 (labial)
2 — ג ז ס צ ץ ש כ ך ק       (sibilant / velar / k-like)
3 — ד ט ת                    (dental)
4 — ל                        (lateral)
5 — מ ם נ ן                  (nasal)
6 — ר                        (liquid)
7 — ח ע ה                    (pharyngeal)
0 — א י                      (silent / semivowel — dropped)
```
The first letter is canonicalised to its group digit so that common
surname variants (`כהן` ↔ `קהן`, `שרון` ↔ `סרון`) yield identical codes.

### English Soundex (Russell 1918)
Standard B-F-P-V → 1, C-G-J-K-Q-S-X-Z → 2, D-T → 3, L → 4, M-N → 5, R → 6.
Verified against canonical fixtures: `Robert → R163`, `Rupert → R163`.

### Known name-variant aliases (seed list — grows, never shrinks)
```
yehuda ↔ yehudah ↔ jehuda ↔ jehudah ↔ yehouda ↔ judah
moshe  ↔ moishe  ↔ mosheh ↔ moses   ↔ mose
binyamin ↔ benjamin ↔ benyamin ↔ binyomin
yitzhak ↔ itzhak ↔ yitshak ↔ isaac ↔ isak ↔ itzik
shlomo  ↔ shelomo ↔ solomon ↔ salomon
david   ↔ dawid   ↔ davide  ↔ dovid  ↔ dawood
yaakov  ↔ jacob   ↔ yaacov  ↔ yankel ↔ yakov
yosef   ↔ yoseph  ↔ joseph  ↔ yossi  ↔ josef
avraham ↔ abraham ↔ avram   ↔ avrum
sarah   ↔ sara    ↔ sarai
miriam  ↔ maryam  ↔ mary    ↔ miri
cohen   ↔ kohen   ↔ kahn    ↔ cohn   ↔ kahan
levi    ↔ levy    ↔ levine  ↔ halevi
ben     ↔ bin
bat     ↔ bath    ↔ bint
```

## 5. Cooling-off Window / תקופת צינון

Per §8 of the AML regulations, PEP status persists for **12 months after
leaving office** (`COOLING_OFF_MONTHS = 12`). `screen()` calls
`_withinPEPWindow(entry, now)` and silently ignores entries whose
`endDate + 12 months < now`.

Test `cooling-off: PEP status persists exactly 12 months after endDate,
then lapses` verifies this by advancing the injected clock across the
12-month boundary.

## 6. Never-Delete Invariant / לא מוחקים

Enforced in three places:

1. **`removeWatchlist()`** — never calls `Map.delete`. Only flips
   `active` to `false` and stamps `deactivatedAt` / `deactivatedBy` /
   `deactivationReason`.
2. **`getEntry(id)`** — returns inactive entries unchanged; the caller
   can still audit past status.
3. **`history[]`** — append-only; `getHistory()` returns a **shallow
   copy** so mutation attempts by callers don't bleed back into the
   source-of-truth.

Tests:
- `removeWatchlist: preserves the record, marks inactive, audit-logged (לא מוחקים)`
- `history log is append-only and ordered (לא מוחקים)`
- `stats: summarises state, bilingual labels` (asserts
  `total unchanged after remove`).

## 7. Test Coverage / כיסוי בדיקות

19 tests covering API surface, bilingual fidelity, never-delete, fuzzy
matching, variant aliases, Soundex equivalence, Levenshtein tolerance,
cooling-off, periodic review, family + associate screening, international
PEPs, statistics, validation, and injectable-clock determinism.

```
✔ constants + exports are frozen and bilingual
✔ addWatchlist: validates category and stores pre-computed match keys
✔ screen: exact Hebrew match returns isPEP=true, HIGH risk, EDD required
✔ fuzzyMatch: Yehuda ↔ Yehudah variant is detected via alias map
✔ fuzzyMatch: Levenshtein catches single-char typos (Moshe → Moshi/Moshe)
✔ fuzzyMatch: Hebrew Soundex catches phonetic near-miss
✔ riskRating: default HIGH; PROHIBITED when entry flagged
✔ enhancedDueDiligenceRequired: true for any match, false for null
✔ removeWatchlist: preserves the record, marks inactive, audit-logged (לא מוחקים)
✔ searchByRole: supports string branch + object filter (judiciary, IDF, Knesset)
✔ periodicReview: flags entries older than 12 months; mark-reviewed updates them
✔ cooling-off: PEP status persists exactly 12 months after endDate, then lapses
✔ family members + close associates are screened like principals
✔ international org PEPs are matched and categorised correctly
✔ history log is append-only and ordered (לא מוחקים)
✔ utility helpers: hebrewSoundex + englishSoundex + levenshtein + transliterate
✔ stats: summarises state, bilingual labels
✔ screen: non-PEP returns isPEP=false, LOW risk, no EDD
✔ seeded constructor: screener accepts seed[] and pre-populates watchlist

ℹ tests 19
ℹ suites 0
ℹ pass 19
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
```

**Threshold required:** ≥ 12 tests passing. **Achieved:** 19/19.

## 8. Mock Transport Pattern / דפוס תחבורה מדומה

No network, no filesystem, no external deps. Every screening call runs
against the in-memory `watchlist` Map seeded at construction time (or
later via `addWatchlist`). This keeps the screener:

- Test-deterministic (no wall clock — `opts.clock` is injectable).
- Free of supply-chain risk (no external packages).
- Compatible with the existing onyx-procurement `test/run-all.js`
  harness.
- Ready for a future real-transport upgrade (OFAC feed, World-Check,
  Dow Jones) as an additive adapter — the API stays frozen.

## 9. Compliance Checklist / רשימת תאימות

| Requirement                                                | Where enforced                                         |
|------------------------------------------------------------|--------------------------------------------------------|
| Definition of PEP per Israeli AML law                      | `PEP_CATEGORY` + `OFFICE_BRANCH`, see §2               |
| 12-month cooling-off after leaving office                  | `_withinPEPWindow` + `COOLING_OFF_MONTHS`              |
| Enhanced Due Diligence for any match                       | `enhancedDueDiligenceRequired()` returns true always   |
| Default risk rating HIGH                                   | `riskRating()` returns `HIGH` for any non-null pep     |
| Periodic review ≥ every 12 months                          | `periodicReview()` + `REVIEW_INTERVAL_MONTHS`          |
| Immutable audit trail                                      | `history[]` append-only, `getHistory()` returns copy   |
| Never-delete rule (לא מוחקים)                              | `removeWatchlist()` flips `active`, never calls delete |
| Bilingual HE+EN error messages and labels                  | Every thrown error + every returned object             |
| Hebrew ↔ English name fuzzy matching                       | `fuzzyMatch()` cascade (7 methods)                     |
| Yehuda/Yehudah variant coverage                            | `NAME_VARIANTS` alias map                              |
| Zero external deps                                          | Only `node:test` + `node:assert/strict`                |

## 10. Hebrew Glossary / מילון

| English                           | עברית                           |
|-----------------------------------|---------------------------------|
| Politically Exposed Person (PEP)  | איש ציבור                       |
| Domestic PEP                      | איש ציבור מקומי                 |
| Foreign PEP                       | איש ציבור זר                    |
| International organisation PEP    | איש ציבור בארגון בינלאומי       |
| Family member                     | בן משפחה                        |
| Close associate                   | מקורב                           |
| Enhanced Due Diligence (EDD)      | בדיקת נאותות מוגברת             |
| Customer Due Diligence (CDD)      | היכרות עם לקוח                  |
| Beneficial owner                  | נהנה סופי                       |
| Watchlist                         | רשימת מעקב                      |
| Screening                         | סינון / בדיקת רקע               |
| Cooling-off period                | תקופת צינון                     |
| Periodic review                   | סקירה תקופתית                   |
| Audit log                         | יומן ביקורת                     |
| Risk rating                       | דירוג סיכון                     |
| High risk                         | סיכון גבוה                      |
| Prohibited                        | אסור                            |
| Money laundering                  | הלבנת הון                       |
| Terror financing                  | מימון טרור                      |
| AML                               | איסור הלבנת הון (אה״ה)          |
| Soundex (phonetic)                | קוד פונטי / סאונדקס             |
| Transliteration                   | תעתיק                           |
| Levenshtein distance              | מרחק עריכה (לוינשטיין)          |
| Fuzzy match                       | התאמה מעורפלת                   |
| Never delete                      | לא מוחקים                       |
| Upgrade and grow                  | משדרגים ומגדלים                 |
| Knesset                           | כנסת                            |
| Cabinet                           | קבינט / ממשלה                   |
| Ministry                          | משרד ממשלתי                     |
| Judiciary                         | מערכת המשפט                     |
| Senior IDF officer                | קצין בכיר בצה״ל                 |
| Senior police officer             | קצין בכיר במשטרה                |
| Diplomat                          | דיפלומט / שגריר                 |
| State-owned company               | חברה ממשלתית                    |
| Municipality                      | רשות מקומית                     |

## 11. Known Gaps / Next-Wave Upgrades (Never Delete, Only Grow)

- **Real data source adapters**: today the watchlist is operator-maintained.
  A future additive adapter can ingest (a) gov.il publications of Knesset
  members and ministers, (b) OFAC SDN list for PROHIBITED upgrades, (c)
  UN sanctions list, (d) a commercial feed (World-Check / Dow Jones).
  The `source` field on each entry already records provenance.
- **Token-level matching**: currently we match whole normalised names.
  Token-level matching (first-last independent) would catch reversed
  order forms ("Cohen, Yehuda" vs "Yehuda Cohen"). Additive only.
- **ML-powered entity resolution**: graph-based link analysis across
  onyx-procurement's supplier/officer/contract tables to automatically
  surface close-associate candidates. Hook through `relationTo`.
- **Localization**: Arabic transliteration for Israeli-Arab name variants.
  Additive: new `name_ar` + `_keyAr` fields.
- **Bulk screening API**: `screenBatch([persons])` for invoice batches.
- **Webhook on new hit**: integrate with the existing notifications
  bridge so every fresh PEP hit raises a compliance ticket.
- **Signed evidence bundle**: on every `screen()` emit a signed JSON
  transcript (entry + match reasoning + clock) for regulator audits.

All future expansions preserve the existing API surface. **No field is
ever removed; new fields are added.**

## 12. Files Shipped / קבצים

- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\onyx-procurement\src\compliance\pep-screener.js`
  — module (zero deps, CommonJS, Node ≥14).
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\onyx-procurement\test\compliance\pep-screener.test.js`
  — `node:test` suite (19 tests).
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\_qa-reports\AG-Y147-pep-screener.md`
  — this report.

## 13. How to Run / הרצה

```
cd onyx-procurement
node --test test/compliance/pep-screener.test.js
```

Expected:
```
ℹ tests 19
ℹ pass 19
ℹ fail 0
```

---

**Signed off by Agent Y-147, 2026-04-11. לא מוחקים — רק משדרגים ומגדלים.**
