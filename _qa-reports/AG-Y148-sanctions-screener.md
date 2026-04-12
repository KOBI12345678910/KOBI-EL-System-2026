# AG-Y148 — Sanctions List Screener / מסנן רשימות סנקציות

**Status:** PASS (16/16 tests green)
**Date:** 2026-04-11
**Agent:** Y-148
**Module:** `onyx-procurement/src/compliance/sanctions-screener.js`
**Tests:** `onyx-procurement/test/compliance/sanctions-screener.test.js`
**Rule enforced:** לא מוחקים רק משדרגים ומגדלים (never delete — only upgrade and grow)

---

## 1. Purpose / מטרה

**EN:** Multi-source sanctions & export-control screener for the Techno-Kol Uzi
Mega-ERP. Screens suppliers, customers, shipping consignees, and invoice
counter-parties against four authoritative lists and enforces Israeli defense
export law (חוק פיקוח על יצוא ביטחוני) before a PO, contract, or shipment is
released downstream in onyx-procurement.

**עברית:** מנוע סינון חד-שלבי לצוות הרכש והציות. מאתר התאמות מול ארבע רשימות
רשויות, מאתר תחומי שיפוט אסורים, בודק פריטים דו-שימושיים (Wassenaar), ומאמת
הצהרות שימוש סופי. אוכף את חוק פיקוח על יצוא ביטחוני של ישראל ואת רשימת MCTL.
כל שורת יומן נוספת — שום רשומה לא נמחקת.

---

## 2. Sources covered / מקורות

| Key        | Authority          | Hebrew                                          |
|------------|--------------------|-------------------------------------------------|
| `OFAC`     | US Treasury        | רשימת OFAC — משרד האוצר האמריקאי                |
| `EU`       | European Union     | רשימת סנקציות מאוחדת — האיחוד האירופי           |
| `UN`       | United Nations     | רשימת מועצת הביטחון של האו״ם                    |
| `IL_DECA`  | Israel MOD / DECA  | אגף פיקוח על יצוא ביטחוני — משרד הביטחון        |

Each source is loaded via the injectable transport. Source URLs + human labels
are exported so the procurement UI can render bilingual badges with direct
links to the authority site (RTL-safe).

---

## 3. API Surface / ממשק תכנות

### 3.1 Construction
```js
const s = new SanctionsScreener({
  fuzzyThreshold: 0.82,         // min similarity for a fuzzy hit
  strictMatchThreshold: 0.95,   // auto-classify as "high confidence"
  locale: 'he',                 // 'he' (default) | 'en'
});
```
Every instance exposes `direction = 'rtl'` so UI layers can read it verbatim.

### 3.2 Transport injection — mockable
```js
s.injectTransport(async (sourceKey, srcMeta) => { /* return payload */ });
```
The fetcher is a plain async function. Tests inject an in-memory fixture; in
production we point it at `https` / cache / S3 — the module never imports any
network library (zero external deps).

### 3.3 List loading
```js
await s.loadList('OFAC');                 // uses injected transport
await s.loadList('EU', customParser);     // custom parser for source-native XML
await s.loadList('UN', parser, payload);  // direct load, bypass transport
```
Returns:
```js
{ source, count, checksum, version, loadedAt, added: [], removed: [] }
```
- `checksum` — SHA-256 of normalised entry fingerprint (Node built-in `crypto`).
- `version` — monotonic per source; bumps on every (re)load.
- `added` / `removed` — deltas vs. previously loaded set (fuels alerts).

### 3.4 Screening
```js
const r = s.screen({
  name: 'Shahid Industries Group',
  aliases: ['SIG'],
  country: 'Iran',
  jurisdiction: 'Iran',          // optional override
  goods: [{ description: 'titanium alloy aerospace parts' }],
  endUseDeclaration: {           // optional
    endUser, country, purpose, certifiesNoDiversion, signedBy, signedAt,
  },
});
```
Result:
```js
{
  screenId,
  screenedAt,
  clear: boolean,
  hitsBySource: { OFAC: [...], EU: [...], UN: [...], IL_DECA: [...] },
  totalHits,
  jurisdictionBlocked,      // { blocked, severity, he, en, iso, via? }
  dualUseHits,              // { flagged, hits: [...] }
  israeliExportFlags,       // { flagged, matched: [...], he, en }
  endUseValidation,         // { valid, reasons, redFlags, jurisdiction }
  recommendation,           // { action, he, en }
}
```

Recommendation actions:
- `approve` — לאשר המשך פעילות (Approve)
- `review`  — דרוש עיון ידני (Manual review required)
- `block`   — חסימה וביקורת מיידית (Block & escalate)

### 3.5 Ancillary surface

| Method                              | Purpose                                            |
|-------------------------------------|----------------------------------------------------|
| `fuzzyMatch(query, entry, thr?)`    | single-entry match; returns `{score, matchedOn}`   |
| `checkJurisdiction(input)`          | blocked-country test (canonical/alias/substring)   |
| `checkDualUseGoods(goods[])`        | Wassenaar-adjacent keyword scan                    |
| `validateEndUseDeclaration(decl)`   | structural + red-flag + destination validation    |
| `falsePositiveReview({state?})`     | read review queue (`pending`/`resolved-*`)         |
| `resolveReview(id, decision, …)`    | transition state (never deletes)                   |
| `getAlerts({since?})`               | delta alerts since a timestamp                     |
| `getChecksums()`                    | SHA-256 + version per source                       |
| `stats()`                           | summary for dashboards                             |

---

## 4. Blocked Jurisdictions / תחומי שיפוט חסומים

| Key             | HE                | EN             | Severity  |
|-----------------|-------------------|----------------|-----------|
| `iran`          | איראן             | Iran           | critical  |
| `north-korea`   | צפון קוריאה       | North Korea    | critical  |
| `syria`         | סוריה             | Syria          | critical  |
| `crimea`        | קרים              | Crimea         | critical  |
| `donetsk`       | דונייצק           | Donetsk        | critical  |
| `luhansk`       | לוהנסק            | Luhansk        | critical  |
| `cuba`          | קובה              | Cuba           | high      |
| `venezuela`     | ונצואלה           | Venezuela      | high      |
| `belarus`       | בלארוס            | Belarus        | high      |
| `russia`        | רוסיה             | Russia         | high      |
| `lebanon`       | לבנון             | Lebanon        | high      |
| `gaza`          | עזה               | Gaza           | high      |
| `myanmar`       | מיאנמר            | Myanmar        | medium    |
| `sudan`         | סודן              | Sudan          | medium    |
| `south-sudan`   | דרום סודן         | South Sudan    | medium    |
| `somalia`       | סומליה            | Somalia        | medium    |
| `libya`         | לוב               | Libya          | medium    |
| `yemen`         | תימן              | Yemen          | medium    |

Matching tolerates ISO codes (`IR`, `KP`, `SY` …), long-form names
("Islamic Republic of Iran"), Hebrew names ("איראן", "צפון קוריאה"), and
substrings ("Crimea Peninsula").

---

## 5. Dual-Use Goods / פריטים לשימוש כפול

Wassenaar-adjacent keyword scanning across 5 categories:

| Category          | עברית                                        |
|-------------------|-----------------------------------------------|
| `metallurgy`      | מתכות ומוצרי מתכת לשימוש כפול                 |
| `aerospace`       | רכיבי תעופה וחלל                              |
| `machine-tools`   | מכונות CNC ומכונות כיול דיוק גבוה             |
| `electronics`     | רכיבי אלקטרוניקה לשימוש צבאי                  |
| `materials`       | חומרים מיוחדים                                |

Representative keywords include `titanium`, `titanium 6Al-4V`, `maraging steel`,
`hastelloy`, `tungsten`, `tantalum`, `beryllium`, `carbon fiber`,
`turbine blade`, `jet engine`, `rocket motor`, `gyroscope`, `inertial
navigation`, `UAV`, `5-axis CNC`, `electron beam welder`, `isostatic press`,
`radiation hardened`, `FPGA military grade`, `thermal imager`,
`laser range finder`, `composite armor`, and `high explosive`.

Each hit is returned with Hebrew + English category labels so the UI can
render RTL badges directly.

---

## 6. Israeli Export Control / חוק פיקוח על יצוא ביטחוני

Dedicated keyword scanner over the entity name + goods descriptions + end-use
declaration. Matches trigger a `defense export license required` /
`נדרש רישיון יצוא ביטחוני` flag.

Keyword set includes (but is not limited to):

```
כלי נשק
פריט לשימוש כפול
MCTL / mctl
פיקוח יצוא ביטחוני
רישיון יצוא ביטחוני
אמצעי לחימה
טכנולוגיה רגישה
defense export / defense article
military commodity / munitions list
wassenaar
```

The MCTL reference aligns with the Israeli Ministry of Defense Defense Export
Control (DECA) definitions of Military Commodities and the Wassenaar Annex I
list of sensitive items.

---

## 7. End-Use Declaration Validator / אימות הצהרת שימוש סופי

Required fields:
- `endUser` — מי הלקוח הסופי
- `country` — מדינת יעד
- `purpose` — מטרת השימוש (חייבת להיות אזרחית)
- `certifiesNoDiversion === true` — התחייבות אי-הסטה
- `signedBy` — חותם הצהרה
- `signedAt` — תאריך חתימה

Red-flag phrase scanner (subset):
`military application`, `weapons development`, `WMD`, `weapons of mass
destruction`, `nuclear enrichment`, `missile development`, `כלי נשק`,
`נשק גרעיני`, `נשק כימי`, `נשק ביולוגי`, `שימוש צבאי`, `פיתוח טילים`.

Destination-country screening reuses `checkJurisdiction` so a plain
declaration that ships to Iran is blocked regardless of other content.

Every validation result is appended to `endUseDeclarations[]` and audited.

---

## 8. Fuzzy Matching / התאמה עמומה

1. `normalise()` — lowercases, strips Hebrew niqqud (`\u0591-\u05C7`),
   strips Latin diacritics (`NFD` + combining marks), collapses punctuation
   and whitespace.
2. `tokenize()` — splits normalised string into tokens of length ≥ 2.
3. `levenshtein()` — iterative O(n×m) edit distance (two-row buffer).
4. `tokenSimilarity()` — `1 - dist / maxLen`.
5. `fuzzyTokenOverlap()` — greedy bipartite match between token sets with a
   per-token similarity threshold (default 0.82).

`fuzzyMatch(query, entry)` tries four strategies, from strongest to weakest:
1. **exact** canonical-name match → score `1`
2. **alias** exact match → score `1`
3. **fuzzy** token overlap vs canonical → `[0.82, 1)`
4. **alias-fuzzy** token overlap vs any alias → `[0.82, 1)`

Any non-exact hit is automatically queued in `falsePositiveReview` for analyst
triage — **nothing is auto-dismissed**, which is the only legally defensible
default when shipping dual-use goods.

---

## 9. SHA-256 Checksum Tracking / מעקב גרסה עם SHA-256

Every `loadList` computes a deterministic SHA-256 over the normalised
entry fingerprint (`${name}|${alias1,alias2,...}`). The checksum + version +
loadedAt are retained per source and surfaced via `getChecksums()`.

Use-cases:
- Detect silent tampering of an offline mirror.
- Confirm which version of the list was used when signing a compliance audit
  report.
- Diff two loads in CI (`list-v1.checksum !== list-v2.checksum`).

---

## 10. Audit Trail & Alerts / יומן ביקורת והתראות

- `auditTrail[]` — append-only; every `injectTransport`, `loadList`, `screen`,
  `validateEndUseDeclaration`, and `resolveReview` is logged with `ts`,
  `action`, and a cloned `payload`.
- `alerts[]` — append-only; each `loadList` that brings in new names emits a
  `new-additions` alert with `count` and (up to 50) names.
- `screenHistory[]` — append-only copy of every screen result.
- `reviewQueue[]` — transitions only; `resolveReview` flips `state` from
  `pending` to `resolved-false-positive` / `resolved-true-positive`, never
  removes the record.

This satisfies the **"לא מוחקים רק משדרגים ומגדלים"** invariant across all
mutable structures — see test `audit trail: append-only, logs every mutation`.

---

## 11. RTL / Bilingual UX

- `direction: 'rtl'` is exposed on every `SanctionsScreener` instance and on
  `stats()` output.
- `locale` defaults to `'he'`.
- All enums (`BLOCKED_JURISDICTIONS`, `DUAL_USE_KEYWORDS`, `SOURCES`) carry
  both `he` and `en` labels, ready for direct binding into RTL badges.
- Recommendation block returns `{ he, en }` so a dashboard can render the
  Hebrew reason alongside an English tooltip — no i18n indirection required.

---

## 12. Test Coverage / כיסוי בדיקות

```
✔ constants export correctly (SOURCES, BLOCKED_JURISDICTIONS, DUAL_USE_KEYWORDS, ISRAELI_EXPORT_KEYWORDS)
✔ helpers: normalise / tokenize / levenshtein / tokenSimilarity / fuzzyTokenOverlap / sha256
✔ injectTransport + loadList: mock fetcher feeds OFAC/EU/UN/IL_DECA
✔ loadList: rejects unknown source and missing transport
✔ loadList: custom parser is invoked (CSV → entries)
✔ loadList: version bumps and delta alerts fire for new additions
✔ fuzzyMatch: exact, alias, fuzzy (typo), and below-threshold
✔ screen: entity hits across OFAC+EU+IL_DECA and flags jurisdiction + israeli export keywords
✔ screen: clean entity with valid end-use declaration is approved
✔ checkJurisdiction: canonical keys, aliases, Hebrew names, substrings
✔ checkDualUseGoods: metallurgy + aerospace + machine-tools are flagged
✔ validateEndUseDeclaration: missing fields, red flags, and happy path
✔ false-positive review queue: fuzzy hits go in, resolve transitions state (never deletes)
✔ audit trail: append-only, logs every mutation (לא מוחקים)
✔ getChecksums + getAlerts + stats: reporting surface is present and bilingual RTL
✔ defaultParser: handles arrays, wrapped objects, JSON strings, CSV strings

tests 16  pass 16  fail 0
```
(16 tests > 12 required minimum.)

---

## 13. How to run / אופן הרצה

```bash
cd onyx-procurement
node --test test/compliance/sanctions-screener.test.js
```

Expected output: `tests 16  pass 16  fail 0`.

---

## 14. Hebrew Glossary / מילון עברי-אנגלי

| English                          | עברית                               |
|----------------------------------|-------------------------------------|
| Sanctions list                   | רשימת סנקציות                       |
| Consolidated list                | רשימה מאוחדת                        |
| Blocked party / SDN              | צד חסום                             |
| Designated national              | אדם מיועד / ישות מיועדת             |
| Screening                        | סינון / בדיקה                       |
| Hit / match                      | התאמה                               |
| False positive                   | התראת שווא                          |
| True positive                    | התאמה אמיתית                        |
| Review queue                     | תור לבדיקה                          |
| Audit trail                      | יומן ביקורת                         |
| Append-only                      | הוספה-בלבד                          |
| Checksum                         | חתימת שלמות                         |
| List version                     | גרסת רשימה                          |
| Delta / new additions            | הבדלים / תוספות חדשות                |
| Alert                            | התראה                               |
| Transport (mock)                 | ספק נתונים (מוק)                    |
| Parser                           | מפענח                               |
| Fuzzy match                      | התאמה עמומה                         |
| Tokenisation                     | אסימוניזציה / פיצול לאסימונים        |
| Aliases                          | כינויים / שמות נוספים                |
| Jurisdiction                     | תחום שיפוט                          |
| Blocked jurisdiction             | תחום שיפוט חסום                     |
| Embargo                          | אמברגו / חרם                        |
| Dual-use goods                   | פריטים לשימוש כפול                  |
| Export license                   | רישיון יצוא                         |
| Defense export                   | יצוא ביטחוני                        |
| MOD / DECA                       | משרד הביטחון / אפ״י                 |
| MCTL                             | רשימת מצרכים צבאיים                  |
| Wassenaar Arrangement            | הסדר וואסנאר                        |
| End-use declaration              | הצהרת שימוש סופי                    |
| End user                         | משתמש סופי                          |
| Non-diversion certification      | התחייבות אי-הסטה                    |
| Red flag                         | נורת אזהרה / דגל אדום               |
| Recommendation                   | המלצה                               |
| Approve / review / block         | אשר / בדוק / חסום                   |
| Escalate                         | הסלם                                |
| Right-to-left                    | מימין לשמאל                         |
| Bilingual                        | דו-לשוני                            |
| Never delete                     | לא מוחקים                           |
| Upgrade and grow                 | משדרגים ומגדלים                     |

---

## 15. Known gaps / Next-wave upgrades (never delete, only grow)

- **Native XML parsing**: `defaultParser` currently handles JSON + CSV. The
  next wave ships source-specific parsers (`ofacXmlParser`, `euXmlParser`,
  `unXmlParser`) still without any external dep (hand-written tokeniser),
  additive to the existing API.
- **Language-specific transliteration**: Hebrew ↔ Latin transliteration for
  Arabic names currently relies on aliases shipped with the source. When the
  transliteration skill is available, wire it behind a feature flag — existing
  callers keep working.
- **Rate-limited scheduled reloads**: a cron that re-runs `loadList` at
  configurable intervals and auto-publishes `alerts` into the existing BI
  dashboard.
- **Integration with `procurement-bridge`**: surface `screen()` as a guard on
  vendor onboarding and PO release; existing surface is untouched.
- **Secondary confirmation (4-eyes)**: `resolveReview` can be extended so a
  `true-positive` decision requires two distinct reviewers before the supplier
  is hard-blocked. Additive field, no breaking change.
- **Historical diff report**: `list-diff(v1, v2)` visualiser on top of the
  existing `added` / `removed` arrays returned by `loadList`.
- **Signed export of audit trail**: emit a PDF / SHA-256-signed tarball for
  external auditors. Uses the existing, immutable `auditTrail`.

All future expansions preserve the existing API surface. **No field is ever
removed; new fields are added.** / **אין הסרת שדות — תמיד הרחבה בלבד.**

---

## 16. Files Shipped / קבצים שהוכנסו

- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\onyx-procurement\src\compliance\sanctions-screener.js` — module (zero deps, CommonJS, Node ≥14).
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\onyx-procurement\test\compliance\sanctions-screener.test.js` — `node:test` suite (16 tests).
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\_qa-reports\AG-Y148-sanctions-screener.md` — this report.
