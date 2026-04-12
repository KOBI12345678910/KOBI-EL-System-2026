# AG-Y146 — AML Hit-Screener
## דוח QA דו-לשוני | Bilingual QA Report

**Agent:** Y-146 — Techno-Kol Uzi Mega-ERP
**Module:** `onyx-procurement/src/compliance/aml-screener.js`
**Date / תאריך:** 2026-04-11
**House rule / כלל ברזל:** לא מוחקים רק משדרגים ומגדלים — NEVER delete, only add/upgrade
**External deps / תלויות חיצוניות:** 0 (`node:crypto` only)

---

## 1. Scope / תחולה

Build an Anti-Money-Laundering (AML) hit-screener for the mega-ERP that
serves Techno-Kol Uzi's dual business — metal fabrication (עבודות מתכת)
and real-estate (נדל"ן). Must comply with Israeli law:

- **חוק איסור הלבנת הון, התש"ס-2000** — Prohibition on Money Laundering
  Law, 5760-2000 — the foundational statute.
- **חוק איסור מימון טרור, התשס"ה-2005** — Prohibition on Terror
  Financing Law, 5765-2005.
- **חוק לצמצום השימוש במזומן, התשע"ח-2018** — Law for the Reduction of
  Cash Use, 5778-2018 (the 11k / 15k caps).
- **צו איסור הלבנת הון (נותני שירות עסקי), התשע"ה-2014** — AML Order for
  Business Service Providers (applies to the metal & RE divisions).
- **תוספת ראשונה** — First Schedule (predicate offences / עבירות מקור).

Regulator / רשות פיקוח:
**הרשות לאיסור הלבנת הון ומימון טרור** — Israel Money-Laundering and
Terror-Financing Prohibition Authority ("IMPA") — Ministry of Justice.

---

## 2. Deliverables / תוצרים

| # | File / קובץ | Size | Lines |
|---|---|---|---|
| 1 | `onyx-procurement/src/compliance/aml-screener.js`         | 46,913 B | 1,118 |
| 2 | `onyx-procurement/test/compliance/aml-screener.test.js`   | 20,838 B |   448 |
| 3 | `_qa-reports/AG-Y146-aml-screener.md`                     | this doc |   —   |

**Total net-new code:** ~67.8 KB / 1,566 lines.
No existing code was removed or edited — only additions (directories created
fresh: `src/compliance/`, `test/compliance/`).

---

## 3. Public API / ממשק ציבורי

```js
const { AMLScreener } = require('./src/compliance/aml-screener');

const screener = new AMLScreener({
  clock,              // () => Date — injectable for tests
  blacklist,          // seed sanctions list [{name, aliases, source, ...}]
  pepList,            // politically-exposed-person names
  highRiskCountries,  // ISO-2 list (defaults to FATF black+grey 2026-Q1)
  threshold,          // ₪ cash ceiling (default 50,000 — statutory min)
  retentionYears,     // default 7 — clamped to >= 7
  fetch,              // mock HTTP transport
  piiSalt,            // SHA-256 salt for PII hashing
});

// Mock HTTP pattern for sanctions API calls
screener.injectTransport(async (url, opts) => ({ status: 200, body: {} }));

screener.screenCustomer(kyc);    // {score, flags, rating, rating_tag, reasons}
screener.screenTransaction(tx);  // {score, flags, reasons, reportable, thresholds}
screener.checkThresholds(tx);    // {triggered, items:[{code,law,he,en}]}
screener.dualCheck(tx, related); // combined cluster analysis
screener.isBlacklisted(name);    // {hit, entry}
screener.isPEP(name);            // boolean
screener.rateCustomer(kyc);      // 'low'|'medium'|'high'|'pep'
screener.addToBlacklist(entry);  // additive only
screener.addPEP(name);
screener.recordCase(data);       // returns id, stores hashed PII
screener.listCases();            // non-expired only
screener.purgeExpired();         // respects 7-year retention
screener.generateSAR(caseData);  // → { id, form, text }  (IMPA draft)
screener.getThresholds();        // introspection
screener.getHighRiskCountries(); // introspection
```

All methods are safe to call with missing/partial input — they return
defaulted envelopes rather than throwing.

---

## 4. Test results / תוצאות בדיקה

Command:
```
cd onyx-procurement
node --test test/compliance/aml-screener.test.js
```

```
✔ constructor enforces 7-year minimum retention                        (1.1 ms)
✔ injectTransport accepts a function and routes calls through it       (2.4 ms)
✔ blacklist matching handles case, diacritics, and aliases             (0.3 ms)
✔ PEP list detects by normalized name                                  (0.2 ms)
✔ screenCustomer: clean KYC → low risk                                 (1.1 ms)
✔ screenCustomer: blacklist hit → high + critical reason               (0.3 ms)
✔ screenCustomer: PEP + high-risk country + no source → high           (0.2 ms)
✔ checkThresholds flags cash ≥ ₪50,000 under חוק איסור הלבנת הון      (14.1 ms)
✔ screenTransaction detects structuring (80–100% of threshold)         (0.6 ms)
✔ dualCheck detects cluster structuring and smurfing                   (0.5 ms)
✔ dualCheck detects rapid in/out within 48h window                     (0.2 ms)
✔ screenTransaction flags high-risk country and round-number amounts   (0.2 ms)
✔ generateSAR produces draft with hashed PII by default                (1.1 ms)
✔ recordCase stores case; purgeExpired respects 7-year retention       (0.3 ms)
✔ checkThresholds flags business cash > ₪11,000                        (0.2 ms)
✔ screenTransaction flags real-estate cash portion ≥ ₪50,000           (0.1 ms)
✔ helpers: normalizeName / hashPII / isRoundAmount / bandOf            (0.1 ms)
✔ every flag has bilingual Hebrew + English label                      (0.1 ms)

ℹ tests 18
ℹ pass  18
ℹ fail  0
ℹ duration_ms 173.6
```

**Tests passed: 18 / 18 (required ≥ 12). Duration: 174 ms.**

---

## 5. Suspicious-pattern coverage / כיסוי דפוסי חשד

| Flag code            | Hebrew                         | English                    | Weight |
|----------------------|--------------------------------|----------------------------|--------|
| `structuring`        | פיצול עסקאות (סטרקצ'רינג)      | Structuring                | 35     |
| `smurfing`           | סמורפינג / שליחים              | Smurfing                   | 30     |
| `rapid_in_out`       | עסקה מהירה – כניסה ויציאה      | Rapid in/out               | 25     |
| `round_number`       | סכומים עגולים                  | Round-number pattern       | 10     |
| `high_risk_country`  | תחום שיפוט בסיכון גבוה         | High-risk jurisdiction     | 40     |
| `pep_match`          | אישיות ציבורית (PEP)           | PEP                        | 45     |
| `blacklist_hit`      | רשימה שחורה / סנקציות          | Blacklist / sanctions hit  | 100    |
| `threshold_breach`   | חציית סף דיווח                 | Reporting threshold breach | 20     |
| `velocity_anomaly`   | תדירות חריגה                   | Velocity anomaly           | 15     |
| `unknown_source`     | מקור כספים לא ברור             | Unknown source of funds    | 20     |
| `cash_cap_breach`    | חריגה מתקרת מזומן              | Cash-cap breach            | 25     |
| `real_estate_cash`   | מזומן בעסקת נדל"ן              | Real-estate cash           | 30     |
| `dual_check_cluster` | צבר עסקאות קשורות              | Related-tx cluster         | 25     |

Risk bands: `low` 0–29 · `medium` 30–59 · `high` 60–100. Blacklist hit
always forces `high`; PEP bumps `low` → `medium` and exposes the
`'pep'` rating-tag.

---

## 6. Threshold table / טבלת ספי דיווח

| Code                  | Trigger                                            | Law / חוק                                                     |
|-----------------------|----------------------------------------------------|----------------------------------------------------------------|
| `CASH_IMPA_50K`       | Cash ≥ ₪50,000 (any direction)                     | חוק איסור הלבנת הון, תש"ס-2000                                 |
| `CASH_BIZ_CAP_11K`    | Business cash > ₪11,000                            | חוק לצמצום השימוש במזומן, תשע"ח-2018                           |
| `CASH_PRIVATE_CAP_15K`| Private cash > ₪15,000                             | חוק לצמצום השימוש במזומן, תשע"ח-2018                           |
| `REALESTATE_CASH_50K` | Real-estate deal cash portion ≥ ₪50,000            | חוק לצמצום השימוש במזומן + חוק מיסוי מקרקעין                   |
| `WIRE_NONRESIDENT_5K` | Non-resident wire ≥ $5,000                         | צו איסור הלבנת הון (נותני שירות במטבע), התשע"ה                 |

Statutory minimum retention is **7 years** per §7 of the 2000 law;
the class clamps `retentionYears` upward and refuses to go below 7.

### FATF high-risk jurisdictions seeded (2026-Q1 snapshot)

Black list (call-for-action): **KP, IR, MM**
Grey list (monitoring): **AL, BB, BF, KH, KY, HT, JM, JO, ML, MZ, NI,
PA, PH, SN, SS, SY, TR, UG, YE, ZW**

The list is **additive only** — to add new jurisdictions use
`addHighRiskCountry()` via the constructor; existing entries can never
be removed (house rule).

---

## 7. Sample SAR output / דוגמת טופס דיווח

```
=======================================================
  טופס דיווח על פעולה בלתי רגילה — SAR Draft
  מוגש לרשות לאיסור הלבנת הון ומימון טרור (IMPA)
=======================================================
מספר דיווח / Report #: SAR-mnuc8tdj-35cd0c331b
תאריך / Date:          2026-04-11T09:00:00.000Z
מוסד מדווח / Reporter: טכנו-קול עוזי מערכות בע"מ

--- נשוא הדיווח / Subject ---
שם / Name:             Acme Shell Corp
ת.ז hash / ID hash:    0270aa33cb5484e15187f59893fd7970c30bbf1c97c68d65b7cba9fc4c723f29
מדינה / Country:       IR

--- פרטי העסקה / Transaction ---
סכום / Amount:         48,000 ILS
סוג / Type:            cash
תאריך / Date:          2026-04-10T08:30:00Z
צד נגדי / Counterparty: Unknown broker
מדינה / Country:       IR

--- דגלי חשד / Suspicion Flags ---
  • רשימה שחורה / סנקציות / Blacklist / sanctions hit
  • תחום שיפוט בסיכון גבוה / High-risk jurisdiction
  • חציית סף דיווח / Reporting threshold breach
  • פיצול עסקאות (סטרקצ'רינג) / Structuring

--- תיאור / Narrative ---
Customer deposited NIS 48,000 in cash just below the ILS 50,000 IMPA
threshold, followed by structured transfers to high-risk jurisdiction.

--- תשתית חוקית / Legal Basis ---
  • חוק איסור הלבנת הון, תש"ס-2000
  • חוק איסור מימון טרור, התשס"ה-2005

שמירת רשומה / Retention: 7 שנים (עד 2033-04-11T03:00:00.000Z)

טיוטה — דורשת בדיקה ואישור של קצין ציות לפני הגשה.
DRAFT — requires compliance-officer review before submission.
```

The structured `form` JSON twin includes the same fields plus machine
keys for pipeline consumption (`report_id`, `legal_basis`, `retention`,
`flags`, `flag_labels_he`, `flag_labels_en`, `subject.id_hash`, etc.).

---

## 8. Security / PII notes / אבטחה ופרטיות

1. **ID numbers are hashed before storage** — `recordCase()` strips the
   raw `subjectId` and replaces it with `subjectIdHash` = SHA-256
   over a per-instance random 16-byte salt (`piiSalt`). The raw
   ID is never written to the case store, nor to the default SAR
   output.
2. **Raw PII in SAR requires explicit opt-in** — `generateSAR({ ...,
   includeRawPII: true })` is available for final regulator submission
   only. By default the SAR carries the hash so draft reviews and
   internal audit don't expose 9-digit Teudat Zehut numbers.
3. **Transport is injectable, never calls out by default** — the class
   has no network I/O unless `injectTransport()` or `opts.fetch` is
   provided. This means the screener is safe to run in sandboxes and
   fully deterministic for tests.
4. **Retention is clamped upward** — `setRetentionYears()` refuses any
   value below the statutory 7 years (§7 of חוק איסור הלבנת הון) but
   accepts longer periods (e.g., the 10-year real-estate rule).
5. **Name normalisation is Unicode-safe** — NFKD + strip combining
   marks so "Avraham" matches "Avrаham" (Cyrillic-a lookalike need
   not be tolerated but diacritics like niqqud are).
6. **Blacklist is additive only** — once an entry is on the list it can
   never be removed by the API. Upgrades replace the array of
   `records[]` but keep the entry key alive.
7. **No secrets in logs** — the class emits no `console.log()` at all;
   callers integrate with their own logger.

---

## 9. Integration points / נקודות שילוב

- **onyx-procurement AP flow** — wire `screenTransaction()` into the
  supplier-payment approval pipeline; any `reportable === true` result
  should block auto-approval and queue a compliance review.
- **Real-estate module** — call `screenTransaction({ type: 'real_estate',
  cashPortion, ... })` during contract signing to enforce the ₪50k cash
  cap before the deposit is recorded.
- **CRM / KYC onboarding** — call `screenCustomer()` on supplier/buyer
  creation and save the returned `rating` on the party record.
- **Sanctions feed** — schedule a nightly job that `addToBlacklist()`s
  each row from OFAC/EU/UN sanctions CSVs (never delete existing rows).
- **IMPA filing** — `generateSAR()` output can be rendered to PDF via
  the existing `src/printing/pdf-generator.js` or serialised to the
  forthcoming IMPA electronic-filing channel. Flip `includeRawPII` just
  before submission.

---

## 10. Glossary / מילון מונחים

| Hebrew / עברית                  | English                                 | Notes |
|---------------------------------|-----------------------------------------|-------|
| הלבנת הון                       | Money laundering                        | "Washing money" |
| הון שחור                        | Black capital / illicit funds           | Proceeds of crime |
| עבירת מקור                      | Predicate offence                       | First Schedule to the 2000 law |
| סף דיווח                        | Reporting threshold                     | Currently ₪50k for cash |
| פיצול עסקאות / סטרקצ'רינג       | Structuring                             | Splitting to stay below threshold |
| סמורפינג                        | Smurfing                                | Many small tx by different actors |
| עסקה מהירה — כניסה ויציאה        | Rapid in/out                            | Funds transit within ~48h |
| סכום עגול                       | Round-number amount                     | Divisible by 1,000 |
| אישיות ציבורית (PEP)            | Politically Exposed Person              | Enhanced due diligence required |
| רשימה שחורה                     | Blacklist                               | OFAC, EU, UN, FATF |
| תחום שיפוט בסיכון גבוה           | High-risk jurisdiction                  | FATF black + grey list |
| KYC — "הכר את הלקוח"            | Know Your Customer                      | Required at onboarding |
| EDD — "בדיקת נאותות מוגברת"      | Enhanced Due Diligence                  | For PEP / high risk |
| קצין ציות                       | Compliance Officer                      | Must sign SAR before filing |
| טופס דיווח                      | Report form                             | IMPA submission format |
| רשות לאיסור הלבנת הון           | IMPA (Israel AML/CFT Authority)         | Regulator — Ministry of Justice |
| תעודת זהות (ת.ז)                | National ID number                      | 9 digits, Luhn-like checksum |
| מזומן                           | Cash                                    | Bills, not bearer cheques |
| עוסק מורשה                      | Registered dealer (VAT)                 | Business subject to business cash cap |
| עסקה לא רגילה                    | Unusual activity                        | Subjective reporting duty |
| שמירת רשומות                     | Record retention                        | Minimum 7 years |

---

## 11. Non-destructive upgrade path / מסלול שדרוג

Future additions that comply with the house rule:

1. **Add new flags** — extend `FLAG_WEIGHTS` and `FLAG_LABELS` with new
   keys; never remove or lower existing ones.
2. **Tighten thresholds** — only *lower* the ₪50k value (or raise
   private/business caps) via `constructor({ threshold })`. The class
   refuses to go below the statutory minimum.
3. **Add sanctions feeds** — call `addToBlacklist()` for every new
   source; duplicates accumulate in the `records[]` array rather than
   overwriting.
4. **Add new jurisdictions** — pass a larger `highRiskCountries` array
   in the constructor; existing ones are preserved because we copy
   into the same Set.
5. **New report types** — additional `generateCTR()` /
   `generateIFTI()` methods can be layered on without touching
   `generateSAR()`.

---

## 12. Known limitations / מגבלות ידועות

- **No automatic feed ingestion** — OFAC/EU CSV parsing lives in a
  sibling module (future Y-147 scope).
- **No Hebrew phonetic matching** — strict normalised exact/fuzzy-
  substring. Phonetic (Metaphone / BeiderMorse) would need a new
  function; can be added without changing existing behaviour.
- **Velocity baseline is hard-coded at ₪1M/month** — a per-customer
  baseline service is out of scope for this agent.
- **SAR output is draft-only** — the electronic filing channel to IMPA
  is not implemented here; the `text` body is ready for compliance
  officer review and manual submission.

---

## 13. Compliance sign-off checklist / רשימת אישור ציות

- [x] חוק איסור הלבנת הון תש"ס-2000 — 50k cash threshold implemented
- [x] חוק לצמצום השימוש במזומן — 11k business / 15k private caps
- [x] Record retention ≥ 7 years (statutory minimum, clamped)
- [x] PII hashing on storage (SHA-256 + per-instance salt)
- [x] Bilingual Hebrew + English labels on every flag
- [x] RTL-safe text rendering in SAR body
- [x] Blacklist additive only — never deletes entries
- [x] Zero external dependencies (Node built-ins only)
- [x] Mock transport via `injectTransport(fn)`
- [x] 18 / 18 tests pass (≥ 12 required)
- [x] IMPA SAR draft format (bilingual JSON + plain-text twin)
- [x] House rule honoured: existing code untouched; only additions

---

**Agent Y-146 — AML hit-screener module delivered and verified.**
**סיום דוח — הסוכן מסיים את משימת Y-146 בהצלחה.**
