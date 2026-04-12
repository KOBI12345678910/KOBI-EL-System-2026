# AG-Y046 — Property Manager (מנהל נכסי נדל"ן)

**Agent:** Y-046
**Swarm:** Real-Estate / Techno-Kol Uzi Mega-ERP
**Wave:** 2026
**Module:** `onyx-procurement/src/realestate/property-manager.js`
**Tests:** `onyx-procurement/test/realestate/property-manager.test.js`
**Status:** IMPLEMENTED — 30 / 30 passing
**Rule of the house:** לא מוחקים רק משדרגים ומגדלים — file never to be deleted, only enhanced.
**Date authored:** 2026-04-11

---

## 1. Purpose

Implements the Israeli real-estate portfolio register for the Techno-Kol Uzi
Mega-ERP. Every property is keyed by the canonical **Tabu triple**
(גוש / חלקה / תת-חלקה) and carries a full append-only history of:

- chain of title (owner history — שרשרת בעלויות)
- valuation records (שומות / הערכות שמאי)
- encumbrances (שעבודים / עיקולים / משכנתאות / הערות אזהרה / צווי מניעה)
- Tabu extract links (נסח טאבו)
- fractional ownership shares (חלקים באחוזים — e.g. 50/50 בני זוג)
- cadastral blob (ADOT / MAPI stub — המרכז למיפוי ישראל)

Zero external dependencies, bilingual Hebrew/English, pure CommonJS, fully
unit-tested. Designed to be called from:

- the betterment-tax engine (AG-Y007) — property identification + chain of title
- the purchase-tax engine (AG-Y008) — propertyType-driven bracket selection
- the annual-tax package — aggregation of owned property for form filing
- the BI dashboard — portfolio-level reporting
- the construction-PM module — links between projects and the underlying lot

---

## 2. Public API

```js
const {
  PropertyManager,
  PROPERTY_TYPES,
  VALUATION_METHODS,
  ENCUMBRANCE_TYPES,
  CADASTRAL_SOURCES,
  HEBREW_LABELS,
} = require('./src/realestate/property-manager');
```

### Class `PropertyManager`

| Method | Purpose |
|---|---|
| `registerProperty(params)` | Create a property record; seeds valuation from `currentValue`. |
| `getProperty(id)` | Fetch by internal id. Returns `null` if missing. |
| `getPropertyByGushHelka(gush, helka, subParcel?)` | Tabu-style lookup. Without `subParcel` returns **every** unit in the parcel (array); with `subParcel` returns the single unit (object). |
| `listProperties(filter?)` | List, with optional `{propertyType, gush, helka}` filter. |
| `linkToTabu(propertyId, tabuRef)` | Attach a Tabu extract — `{extractNumber, issuedAt, office, pdfUrl, hash, owners[], encumbrances[]}`. Owners in the extract are auto-appended to `ownerHistory`. |
| `addOwner(propertyId, owner)` | Append to chain of title. Default closes any open owner; pass `keepOpen:true` for co-ownership. |
| `ownerHistory(propertyId)` | Full chain, never truncated. |
| `updateValuation(propertyId, v)` | Append a valuation — `{date, value, valuer, method, note, currency}`. |
| `valuationHistory(propertyId)` | Chronologically-sorted history (ascending). |
| `currentValuation(propertyId)` | Latest-by-date. |
| `addEncumbrance(propertyId, e)` | Register a lien / mortgage / caveat / injunction. |
| `releaseEncumbrance(propertyId, id, note?)` | **Never deletes** — marks `releasedAt` with a note. |
| `encumbrances(propertyId, opts?)` | Active by default; `includeReleased:true` for full history. |
| `ownershipShare({propertyId, owner, sharePct})` | Add a fractional share record; rejects if running total > 100%. |
| `totalOwnershipShare(propertyId)` | Sum of all `sharePct` records. |
| `ownershipShares(propertyId)` | List of share records. |
| `cadastralData(propertyId)` | ADOT / MAPI stub blob (keyed to the Tabu triple). |
| `exportProperty(propertyId)` | JSON-safe deep snapshot. |
| `snapshot()` | Portfolio-wide JSON dump. |
| `auditTrail()` | Append-only audit log of every mutation. |

All returned records are **frozen shallow copies** — callers cannot mutate
internal state.

### `registerProperty(params)` — schema

```js
{
  id?: string,                  // auto-generated if omitted
  address: string,              // Hebrew street names fully supported (UTF-8)
  gush: number,                 // גוש                       — alias: block
  helka: number,                // חלקה                      — alias: parcel
  subParcel?: number,           // תת-חלקה (בית משותף)
  propertyType: 'residential' | 'commercial' | 'industrial' | 'land' | 'mixed',
  areaSqm?: number,             // שטח במ"ר
  rooms?: number,               // מספר חדרים
  floors?: number,              // קומה
  purchaseDate?: string,        // ISO date
  purchasePrice?: number,       // ₪
  currentValue?: number,        // ₪  — seeds the first valuationHistory entry
  encumbrances?: Array<{type, holder, amount, ...}>,
  photos?: string[],
  blueprints?: string[],
  certificates?: string[],
}
```

### Property types — `PROPERTY_TYPES`

| Key | Hebrew | English | Typical bracket context |
|---|---|---|---|
| `residential` | נכס מגורים | Residential | דירות, בתים פרטיים — mas-rechisha progressive |
| `commercial` | נכס מסחרי | Commercial | משרדים, חנויות — flat 6% purchase tax |
| `industrial` | נכס תעשייתי | Industrial | מפעלים, מחסנים — flat 6% |
| `land` | קרקע | Land | מגרש, שטח חקלאי — flat 6% |
| `mixed` | שימוש מעורב | Mixed-use | מסחר + מגורים — composite tax treatment |

### Encumbrance types — `ENCUMBRANCE_TYPES`

| Key | Hebrew | Notes |
|---|---|---|
| `mortgage` | משכנתא | Bank / lender, usually with `amount` and `referenceNumber` |
| `lien` | שעבוד | Generic security interest |
| `caveat` | הערת אזהרה | §126 חוק המקרקעין; holder = buyer, lawyer, beneficiary |
| `injunction` | צו מניעה | Court order; carries `court` field |
| `tax_lien` | עיקול מס | רשות המסים / ביטוח לאומי / עיריה |
| `easement` | זיקת הנאה | Right-of-way / utility easement |
| `attachment` | עיקול | Civil execution / הוצל"פ |
| `bankruptcy` | כינוס נכסים | Receiver / trustee |

### Valuation methods — `VALUATION_METHODS`

| Key | Hebrew | Notes |
|---|---|---|
| `comparable` | גישת ההשוואה | Standard residential appraisal |
| `income` | היוון הכנסות | Income-producing commercial |
| `cost` | עלות השחלוף | New construction / industrial |
| `DCF` | תזרים מזומנים מהוון | Multi-tenant / long-horizon |
| `auction` | מכירה פומבית | Receiver / כונס נכסים |
| `self` | הערכה עצמית | Owner-declared (seed) |

---

## 3. Israeli Tabu format (נסח טאבו)

The **Tabu triple** is the canonical key in the Israeli Land Registry
(לשכת רישום המקרקעין), which has been continuously maintained since the
Ottoman land survey of 1858 and was systematized under British Mandate Land
Ordinances of 1921-1928, then absorbed into state law via חוק המקרקעין,
התשכ"ט-1969 and חוק רישום המקרקעין, התשכ"ט-1969.

```
  גוש   (gush / block)        top-level cadastral block number, always ≥ 1000
  חלקה (helka / parcel)       parcel inside the block
  תת-חלקה (tat-helka)          sub-parcel within a parcel — a specific unit
                              (apartment / storage / parking spot) in a
                              condominium ("בית משותף")
```

A fully qualified reference looks like `גוש 7106 חלקה 42 תת-חלקה 5`, which
the module keys as `"7106/42/5"` internally. Lookups that omit the sub-parcel
return **every unit** in the parcel, so a single call covers the entire
בית משותף — useful for the annual-tax aggregation pass.

The `linkToTabu()` method accepts a `tabuRef` object approximating the
structure of an actual נסח טאבו PDF extract:

```js
{
  extractNumber: 'TAB-2026-00042',           // מספר הנסח
  issuedAt:      '2026-03-20',               // תאריך הפקה
  office:        'לשכת רישום מקרקעין תל אביב', // לשכה מפיקה
  pdfUrl:        'https://tabu.gov.il/...',   // קישור לקובץ
  hash:          'sha256:...',               // אימות תוכן
  owners:        ['כהן דוד', 'כהן שרה'],     // בעלים רשומים (שם + ת.ז.)
  encumbrances:  [                            // שעבודים רשומים
    { type: 'mortgage', holder: 'בנק הפועלים' }
  ]
}
```

When the extract declares owners, they are **automatically appended to
`ownerHistory` with `source: 'tabu'`** — the chain of title is never lost.
Multiple Tabu links per property are supported (e.g. a refresh every few
years), and earlier links are retained forever.

---

## 4. Chain of title (ownerHistory)

Owners are stored in insertion order. On `addOwner()` the default behaviour
is:

1. Close any previously open owner (`to === null`) by setting `to` to the
   new owner's `from` date (or `now` if not supplied).
2. Insert the new owner with `to = null` (still open).

For co-ownership (spouses, heirs, partnerships) pass `keepOpen: true` to
avoid closing the preceding entry; in that mode both records stay open
simultaneously. Every entry carries:

```js
{
  id, name, idNumber,    // ת.ז. / ח.פ.
  from, to,              // ISO dates (to === null means still owner)
  sharePct,              // optional — redundant with ownershipShare, not
                         //            enforced at the historical level
  source,                // 'manual' | 'tabu' | 'inheritance' | ...
  note,
  recordedAt             // when we wrote the record
}
```

The module never mutates or deletes historical entries.

---

## 5. Fractional ownership — `ownershipShare`

Separate from the chain of title, fractional ownership tracks **who currently
owns what percentage** of the property. Typical scenarios:

| Scenario | Records | Sum |
|---|---|---|
| Single owner | `{owner:'כהן דוד', sharePct:100}` | 100% |
| Spouses (50/50) | `{owner:'כהן דוד',50}, {owner:'כהן שרה',50}` | 100% |
| 4-way inheritance | 4 × 25% | 100% |
| Majority partner | `{owner:'משקיע א',70}, {owner:'משקיע ב',30}` | 100% |

`ownershipShare()` rejects any addition that would push the running total
above 100% (with a 1e-6 epsilon for float safety). `totalOwnershipShare()`
returns the current sum — callers are expected to verify `== 100` before
assuming the portfolio is fully attributed.

---

## 6. Valuation history (שומות)

`valuationHistory` is an append-only array. Every `updateValuation()` call
adds a new record; the `currentValuation()` helper returns the latest-by-date
entry. Back-dated historical appraisals therefore **never clobber** a
newer figure.

The `registerProperty` seed valuation uses `purchaseDate` as its date (or
the 1970 epoch when `purchaseDate` is absent) so any later appraisal
naturally takes precedence.

Fields on each valuation:

```js
{
  id,
  date,                  // when the appraisal took place
  value,                 // ₪ (or other currency)
  valuer,                // 'שמאי - רונן שלו' etc.
  method,                // VALUATION_METHODS
  note,
  currency: 'ILS',       // default; overridable
  recordedAt,            // when we wrote the record
}
```

---

## 7. Encumbrance tracking (שעבודים / עיקולים)

Encumbrances cover every real burden that can attach to an Israeli parcel:

- משכנתא (bank mortgage)
- שעבוד (generic security interest)
- הערת אזהרה (caveat under §126 חוק המקרקעין)
- עיקול (civil execution, הוצל"פ)
- עיקול מס (tax lien — רשות המסים / ביטוח לאומי / עיריה)
- צו מניעה (court injunction — carries `court` field)
- זיקת הנאה (easement)
- כינוס נכסים (bankruptcy / receiver)

`releaseEncumbrance()` **never deletes** the record. It flips `releasedAt`
from `null` to the current ISO timestamp and stores an optional
`releaseNote`. The default `encumbrances()` view hides released records; pass
`{ includeReleased: true }` for the full history.

---

## 8. Cadastral data stub (ADOT / MAPI)

`cadastralData(propertyId)` returns a structured blob keyed to the property's
gush/helka/sub-parcel:

```js
{
  source:         'ADOT',     // הרשות למדידות / המרכז למיפוי ישראל
  gush, helka, subParcel,
  planReference:  null,       // יעודי תב"ע — תכניות
  coordinates:    null,       // {x,y} in Israeli Transverse Mercator (ITM)
  zoning:         null,       // ייעוד תכנוני
  plannedUse:     null,       // שימוש מותר
  buildingRights: null,       // זכויות בנייה
  bettermentLevy: null,       // היטל השבחה — raw uplift data
  fetchedAt:      null,
  note:           'stub — wire PropertyManager with opts.cadastralFetcher …',
}
```

The stub is a contract placeholder for downstream wiring against the real
APIs. The קטסטר (cadastre), ADOT, and MAPI systems are all ultimately
keyed by the same (gush, helka) pair, which is why the stub returns the
triple it was called with.

---

## 9. Hebrew glossary — מילון מונחים

| Hebrew | Transliteration | English |
|---|---|---|
| גוש | gush | cadastral block |
| חלקה | helka | parcel |
| תת-חלקה | tat-helka | sub-parcel / unit in a condominium |
| נסח טאבו | nesach tabu | Land Registry extract |
| לשכת רישום המקרקעין | lishkat rishum ha-mekarke'in | Land Registry office ("Tabu") |
| בית משותף | bayit meshutaf | condominium |
| בעלים | ba'alim | owner(s) |
| שרשרת בעלויות | sharsheret ba'aluyot | chain of title |
| שומה / הערכת שמאי | shuma / ha'arachat shamai | appraisal |
| שמאי מקרקעין | shamai mekarke'in | real-estate appraiser |
| משכנתא | mashkanta | mortgage |
| שעבוד | shi'abud | lien / security interest |
| הערת אזהרה | he'arat azhara | caveat (§126 חוק המקרקעין) |
| צו מניעה | tzav meni'a | court injunction |
| עיקול | ikul | civil attachment / execution |
| עיקול מס | ikul mas | tax lien |
| זיקת הנאה | zikat hana'a | easement |
| כינוס נכסים | kinus nechasim | receivership / bankruptcy |
| היתר בנייה | heter bniya | building permit |
| היטל השבחה | hetel hashbaha | betterment levy (§196א חוק התכנון והבנייה) |
| ייעוד תכנוני | yi'ud tichnuni | planning designation / zoning |
| זכויות בנייה | zchuyot bniya | building rights |
| תב"ע | tav"a | urban master plan (תכנית בנין עיר) |
| ת.ז. | teudat zehut | national ID number |
| ח.פ. | ch.p. | corporate registration number |
| ITM | --- | Israeli Transverse Mercator (national grid) |
| ADOT / מפ"י | MAPI | Authority for Surveying / Mapping Center of Israel |

---

## 10. Test coverage

```
Suite: property-manager.test.js  (node --test, zero deps)
┌───────────────────────────────────────────────────────────────┐
│ 30 tests, all passing                                         │
├───────────────────────────────────────────────────────────────┤
│ 01. constants frozen, Hebrew labels present                   │
│ 02. registerProperty happy path                                │
│ 03. block/parcel aliases                                       │
│ 04. auto-generated id                                          │
│ 05. rejects missing gush/helka                                 │
│ 06. rejects unknown propertyType                               │
│ 07. rejects duplicate id                                       │
│ 08. getPropertyByGushHelka exact triple                        │
│ 09. parcel-level lookup returns all sub-parcels                │
│ 10. lookup miss → null                                         │
│ 11. string-numeric gush/helka                                  │
│ 12. linkToTabu + auto owner append                             │
│ 13. linkToTabu input validation                                │
│ 14. ownerHistory chain of title (close prior)                  │
│ 15. keepOpen=true co-ownership                                 │
│ 16. updateValuation append + chronological sort + current      │
│ 17. valuation input validation                                 │
│ 18. encumbrance add + release (never delete)                   │
│ 19. encumbrance type validation                                │
│ 20. ownershipShare 50/50 sums to 100%                          │
│ 21. rejects totals above 100%                                  │
│ 22. rejects out-of-range sharePct                              │
│ 23. complex 4-way partition (25/25/25/25)                      │
│ 24. cadastralData stub blob                                    │
│ 25. exportProperty JSON-safe round trip                        │
│ 26. snapshot portfolio dump                                    │
│ 27. auditTrail records every mutation                          │
│ 28. internal gushHelkaKey normalization                        │
│ 29. listProperties filter                                      │
│ 30. end-to-end Tel Aviv apartment lifecycle                    │
└───────────────────────────────────────────────────────────────┘
```

Run locally:

```bash
cd onyx-procurement
node --test test/realestate/property-manager.test.js
```

Latest run: **30 / 30 passing** (2026-04-11).

---

## 11. Examples

### Example A — Register and look up a Tel Aviv apartment

```js
const { PropertyManager } = require('./src/realestate/property-manager');
const pm = new PropertyManager();

pm.registerProperty({
  id: 'p-dizengoff-77',
  address: 'רחוב דיזנגוף 77, תל אביב',
  gush: 7106,
  helka: 42,
  subParcel: 5,
  propertyType: 'residential',
  areaSqm: 92,
  rooms: 4,
  purchaseDate: '2019-06-15',
  purchasePrice: 2_450_000,
  currentValue: 3_100_000,
});

const found = pm.getPropertyByGushHelka(7106, 42, 5);
// → full property snapshot
```

### Example B — Spouses at 50/50, mortgage released on refinance

```js
pm.ownershipShare({ propertyId: 'p-dizengoff-77', owner: 'כהן דוד', sharePct: 50 });
pm.ownershipShare({ propertyId: 'p-dizengoff-77', owner: 'כהן שרה', sharePct: 50 });
pm.totalOwnershipShare('p-dizengoff-77'); // → 100

const mortgage = pm.addEncumbrance('p-dizengoff-77', {
  type: 'mortgage',
  holder: 'בנק הפועלים',
  amount: 1_800_000,
  referenceNumber: 'MORT-9001',
});

pm.releaseEncumbrance('p-dizengoff-77', mortgage.id, 'מיחזור משכנתא');
// Record remains in encumbrances with releasedAt set — never deleted.
```

### Example C — Back-dated appraisal never clobbers the current value

```js
pm.updateValuation('p-dizengoff-77', {
  date: '2026-01-15',
  value: 3_900_000,
  valuer: 'שמאי - יעל שפירא',
  method: 'DCF',
});

pm.updateValuation('p-dizengoff-77', {
  date: '2022-01-10',   // back-dated
  value: 3_300_000,
  valuer: 'שמאי - אברהם כהן',
  method: 'comparable',
});

pm.currentValuation('p-dizengoff-77').value;   // → 3,900,000 (latest date wins)
```

### Example D — Tabu extract auto-feeds the chain of title

```js
pm.linkToTabu('p-dizengoff-77', {
  extractNumber: 'TAB-2026-00042',
  issuedAt: '2026-03-20',
  office: 'לשכת רישום מקרקעין תל אביב',
  pdfUrl: 'https://tabu.gov.il/extracts/2026-00042.pdf',
  hash: 'sha256:aa',
  owners: ['כהן דוד', 'כהן שרה'],
});
pm.ownerHistory('p-dizengoff-77'); // includes the two owners with source:'tabu'
```

---

## 12. Future enhancements (on upgrade path, NEVER deletion)

Per the house rule (לא מוחקים רק משדרגים ומגדלים), future work enhances this
module without touching existing behaviour. All items are **additive**:

| # | Enhancement | Status |
|---|---|---|
| 1 | Wire real ADOT / MAPI fetcher (`opts.cadastralFetcher`) | pending |
| 2 | Tabu PDF parser — populate `tabuLinks[].owners` from נסח תקין | pending |
| 3 | Govmap layer integration for `coordinates` (ITM) | pending |
| 4 | Integration with betterment-tax engine (AG-Y007) for automatic shevach quotes | pending |
| 5 | Integration with purchase-tax engine (AG-Y008) via `propertyType` | pending |
| 6 | Persistence layer — store every record in SQL / document store | pending |
| 7 | REST endpoints under `POST /api/realestate/property` | pending |
| 8 | UI — Hebrew RTL property card with full chain of title | pending |
| 9 | Multi-year היטל השבחה ladder per plan approval | pending |
| 10 | OCR bridge for uploaded נסח טאבו PDFs | pending |
| 11 | Photo / blueprint / certificate blob storage abstraction | pending |
| 12 | Geolocation join to municipal GIS for `zoning` + `plannedUse` | pending |
| 13 | Multi-currency valuation (ILS primary, USD/EUR for foreign investors) | pending |
| 14 | Batch import from CSV / Excel of portfolio holdings | pending |
| 15 | Audit trail export to the general ledger as FK references | pending |

The public API is frozen once this module is merged; new features add new
named exports or extend the returned object with new keys.

---

## 13. Files

| Path | Purpose |
|---|---|
| `onyx-procurement/src/realestate/property-manager.js` | Engine (~580 LOC, zero deps) |
| `onyx-procurement/test/realestate/property-manager.test.js` | Node test-runner unit tests — 30 tests |
| `_qa-reports/AG-Y046-property-manager.md` | This report — **never delete** |

---

## 14. Sign-off

- [x] Zero external dependencies (pure CommonJS + node:test)
- [x] 30 / 30 tests passing
- [x] Bilingual output (Hebrew + English)
- [x] Zero mutation of caller inputs — all returned records frozen
- [x] Append-only model for owners / valuations / encumbrances / Tabu links
- [x] Israeli Tabu triple (גוש / חלקה / תת-חלקה) as primary key
- [x] Full Hebrew glossary included in this report
- [x] Property types enumerated with Hebrew labels
- [x] ADOT / MAPI cadastral stub in place
- [x] Audit trail recording every mutation
- [x] Documented in this QA report

**Agent Y-046 signing off.**
