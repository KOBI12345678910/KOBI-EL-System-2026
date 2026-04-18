# AG-Y044 — Material Certificate (Mill Cert) Tracker

**Agent:** Y-044 — Swarm Manufacturing
**System:** Techno-Kol Uzi Mega-ERP (Israeli metal fab) — Wave 2026
**Module:** `onyx-procurement/src/manufacturing/material-cert.js`
**Test:**   `onyx-procurement/test/manufacturing/material-cert.test.js`
**Date:**   2026-04-11
**Rule:**   לא מוחקים רק משדרגים ומגדלים — never delete, only upgrade & grow.

---

## 1. Purpose — מטרת המערכת

Every piece of structural steel, stainless sheet, pipe, tube or profile that
enters the shop floor at "טכנו-קול עוזי" must be **traceable back to the
mill** that produced it. The mill issues an **Inspection Certificate** (מיל-סרט)
stating the heat number, chemistry, mechanical properties, and the material
standard the material conforms to.

Without a working mill-cert tracker the shop cannot:

- Bind a physical lot to its documentation (required by every structural-steel
  customer, and by Israeli מפרט כללי 02 for public construction).
- Defend the Certificate of Conformance (CoC) that is shipped to the end
  customer at delivery.
- Recall all lots cut from the same heat if a downstream defect is discovered.
- Respond to a QA audit asking "where did this plate come from?".

This module provides all of the above in a single zero-dependency class,
bilingual Hebrew/English, with an immutable audit log.

---

## 2. EN 10204 — Certificate Types (תעודות EN 10204)

`EN 10204:2004` defines four certificate types. The tier numbers below are
our internal ranking (higher = more rigorous).

| Type | Hebrew | English | Specific? | Mill Sig? | Indep. Inspector? | Tier |
|---|---|---|:---:|:---:|:---:|:---:|
| **2.1** | הצהרת התאמה — לא ספציפי | Declaration of compliance (non-specific) |  |  |  | 1 |
| **2.2** | דוח בדיקה — לא ספציפי | Test report (non-specific) |  | ✔ |  | 2 |
| **3.1** | תעודת בדיקה ספציפית — חתומה ע"י QC של היצרן | Inspection cert (specific) — mill QC signed | ✔ | ✔ |  | 3 |
| **3.2** | תעודת בדיקה ספציפית — חתומה גם ע"י מפקח חיצוני | Inspection cert (specific) — counter-signed | ✔ | ✔ | ✔ | 4 |

### Rule differences

- **2.1** — Supplier statement only, no test values required. Acceptable for
  non-critical commodity material (rebar for non-structural fill, fencing).
- **2.2** — Supplier attests that tests were performed on "similar" heats, but
  not necessarily on the specific batch shipped. Signed by the supplier QC.
- **3.1** — Tests performed on *this specific* heat, signed by a mill inspector
  who is independent of production department. This is the baseline for
  structural steel in Israel (EN 10025 S235/S275/S355).
- **3.2** — 3.1 plus a counter-signature from an *external* authorised
  inspector (Lloyd's Register, TÜV, SGS, Bureau Veritas, …). Required for
  pressure vessels, offshore, nuclear, aerospace.

The module rejects a 3.2 cert that does not carry an `inspectorStamp` field.

---

## 3. Material-Standard Catalog — קטלוג תקני חומר

Built-in specs (all values enforced by `verifyAgainstStandard`):

| Standard | Family | Yield (MPa) | Tensile (MPa) | Elongation (%) |
|---|---|---:|---:|---:|
| EN 10025 S235 | structural carbon | ≥ 235 | 360–720 | ≥ 26 |
| EN 10025 S275 | structural carbon | ≥ 275 | 410–720 | ≥ 23 |
| EN 10025 S355 | structural carbon | ≥ 355 | 470–720 | ≥ 22 |
| ASTM A36 | structural carbon | ≥ 250 | 400–550 | ≥ 20 |
| ASTM A572 Gr50 | HSLA | ≥ 345 | 450–620 | ≥ 18 |
| ASTM A500 Gr B | hollow section | ≥ 290 | 400–560 | ≥ 23 |
| EN 10216 P235GH | seamless pressure pipe | ≥ 235 | 360–500 | ≥ 25 |
| AISI 304 | austenitic stainless | ≥ 205 | 515–900 | ≥ 40 |
| AISI 316 | Mo-bearing stainless | ≥ 205 | 515–900 | ≥ 40 |

### Chemistry limits (mass %)

The spec object encodes two kinds of limits:

- `chemistryMax` — the element **cannot exceed** this value.
- `chemistryMin` — the element **cannot go below** this value (used for
  stainless alloys — 304 must have ≥ 18 % Cr, 316 must have ≥ 2 % Mo).

Example for **EN 10025 S355**:

```
chemistryMax: { C: 0.24, Mn: 1.70, P: 0.045, S: 0.045,
                Si: 0.55, Cu: 0.55, N: 0.012 }
mechanicalMin: { yieldStrength: 355, tensile: 470, elongation: 22 }
tensileMax: 720
```

### Chemistry fields captured on every cert

The `receiveCert` API accepts the following chemistry object (all mass %):

| Symbol | Name (EN) | Name (HE) | Typical in |
|---|---|---|---|
| C | Carbon | פחמן | all steels |
| Si | Silicon | סיליקון | all steels |
| Mn | Manganese | מנגן | all steels |
| P | Phosphorus | זרחן | trace (≤ 0.045) |
| S | Sulfur | גפרית | trace (≤ 0.045) |
| Cr | Chromium | כרום | stainless (18–20 %) |
| Ni | Nickel | ניקל | stainless (8–14 %) |
| Mo | Molybdenum | מוליבדן | 316 stainless |
| Cu | Copper | נחושת | structural (≤ 0.55) |
| N | Nitrogen | חנקן | stainless austenitics |
| other | custom key/value map | נוסף | trace / micro-alloy |

Extra fields (Nb, V, Ti) can be passed through `chemistry.other` and are
ignored by the standard-comparison logic unless the spec declares a limit
on them (A572 Gr 50 checks Nb and V).

### Mechanical fields captured

| Symbol | Name (EN) | Name (HE) | Unit |
|---|---|---|---|
| yieldStrength | Yield strength | מאמץ כניעה | MPa |
| tensile | Ultimate tensile | מאמץ שבירה | MPa |
| elongation | Elongation at break | התארכות | % |
| hardness | Hardness | קשיות | HB / HRC |
| impact | Charpy impact energy | אנרגית חריץ | J |

---

## 4. API Surface — ממשק המחלקה

`class MaterialCertManager` (zero deps, pure `node:` built-ins):

| Method | Purpose (EN) | מטרה (HE) |
|---|---|---|
| `receiveCert(input)` | Store a freshly arrived mill cert; idempotent on heat number (revised certs stack into `history[]`). | קליטת תעודה חדשה; גרסה חדשה לאותו heat נערמת להיסטוריה. |
| `verifyAgainstStandard(cert, standardSpec?)` | Compare chemistry + mechanicals against a material standard. Returns `{pass, chemistry_checks[], mechanical_checks[]}`. | בדיקת תעודה מול תקן חומר. |
| `associateWithLot(certId, lotOrId)` | Bind a physical lot to a cert. Accepts either an existing `lotId` string or a new lot payload. | קישור מגרש פיזי לתעודה. |
| `traceByLot(lotId)` | Upstream trace: lot → cert → supplier → mill + conformance check. | מעקב מהמגרש אל המיל-סרט. |
| `traceByHeatNumber(heat)` | All certs and lots from the same heat (normalised: `HB-123456` === `hb 123456`). | מעקב לפי מספר יציקה (heat). |
| `searchByStandard(standard)` | Rolled-up inventory of certified material per standard. | מלאי לפי תקן. |
| `alertExpiringInventory({yearsThreshold, referenceDate})` | Flag certs stored > 5 years for re-inspection. | אזהרת אחסון ממושך. |
| `generateCoC(shipment)` | Bundle every mill cert touched by a shipment into a Certificate of Conformance. | הפקת תעודת התאמה ללקוח. |

### `receiveCert` input contract

```js
{
  cert_type: '2.1' | '2.2' | '3.1' | '3.2',
  supplier:  'חברת ברזל',       // Hebrew or English; matched against ISRAELI_SUPPLIERS
  mill:      'ArcelorMittal Ostrava',
  heat_number: 'HB-700123',
  material_grade: 'S355JR',
  standard: 'EN 10025 S355',
  chemistry:  { C, Si, Mn, P, S, Cr, Ni, Mo, Cu, other? },
  mechanical: { yieldStrength, tensile, elongation, hardness, impact },
  dimensions: { thickness, width, length, OD?, wallThickness? },
  quantity:  12,
  inspectorStamp: 'Lloyds-IL-5521',    // required for 3.2
  documents: ['/certs/HB-700123.pdf'], // relative to the onyx FS root
  issueDate: '2026-01-15'              // optional, defaults to now
}
```

### Never-delete semantics (לא מוחקים)

- Receiving a cert with a heat number that already exists does **not**
  overwrite the old record — it bumps `version`, snapshots the old cert
  into `history[]`, and reuses the same `certId`.
- Re-binding a lot to a new cert pushes the previous `{ previousCertId,
  rebindingAt }` pair into `lot.history[]`.
- Every mutating call appends to `auditLog` — there is no remove, no
  truncate, no compaction.

---

## 5. Israeli Supplier Catalog — ספקי ברזל ישראליים

Seed list (non-exhaustive; extend as new suppliers come online):

| Key (HE) | EN | Heat Prefix | Typical Cert | PDF name pattern |
|---|---|---|---|---|
| חברת ברזל | Hevrat Barzel Ltd. | HB, CB | 3.1 | `^CB[-_ ]?\d{6}` |
| ברזלי | Barzeli Metals | BZ | 2.2 | `^BZ[-_ ]?\d{4,}` |
| שחם מתכות | Shaham Metals | SH, SHM | 3.1 | `^SH[M]?[-_ ]?\d{5,}` |
| כבירים | Kvirim Metals | KV, KVR | 3.1 | `^KV[R]?[-_ ]?\d{5,}` |
| י.ד. ברזל | Y.D. Barzel | YD | 2.2 | `^YD[-_ ]?\d{4,}` |

When the supplier key matches, `receiveCert` attaches `supplier_meta` to
the stored record so downstream consumers (printing, CoC generation)
know which supplier formats apply.

---

## 6. Hebrew Glossary — מילון מונחים

| Hebrew | English | Context |
|---|---|---|
| תעודת חומר | Material certificate | generic |
| תעודת יצרן / מיל-סרט | Mill certificate | EN 10204 |
| תעודת התאמה | Certificate of Conformance (CoC) | delivered to end customer |
| מספר יציקה | Heat number | unique batch identifier from the mill |
| תקן | Standard | EN/ASTM/AISI reference |
| כימיה / הרכב כימי | Chemistry / composition | mass % per element |
| תכונות מכניות | Mechanical properties | yield/tensile/elongation |
| מאמץ כניעה | Yield strength | MPa |
| מאמץ שבירה | Tensile strength | MPa |
| התארכות | Elongation at break | % |
| קשיות | Hardness | HB / HRC |
| אנרגית חריץ / Charpy | Charpy impact energy | J, at a stated temperature |
| מגרש | Lot | physical batch on the shop floor |
| מחסן | Warehouse / storage location | |
| מפקח חיצוני | Independent inspector | required for 3.2 |
| בקרת איכות יצרן | Mill QC | independent of production, required for 3.1 |
| ספק ברזל | Steel supplier / trader | Israeli intermediary |
| יצרן / מפעל רולינג | Mill | upstream producer |
| רישום חומר | Material traceability | |
| פלדה קונסטרוקטיבית | Structural steel | S235/S275/S355 |
| פלדה דלת-פחמן | Low-carbon steel | A36 |
| פלדה HSLA | High-Strength Low-Alloy | A572 |
| פרופיל חלול | Hollow section | A500, RHS, SHS, CHS |
| צינור לחץ | Pressure pipe | P235GH, P265GH |
| נירוסטה אוסטניטית | Austenitic stainless | 304, 316 |
| גלוון חם | Hot-dip galvanized | protective coating |
| צביעה באבקה | Powder coating | finish |

---

## 7. Standard References — הפניות לתקנים

- **EN 10204:2004** — *Metallic products — Types of inspection documents.*
- **EN 10025-2:2019** — *Hot rolled products of structural steels — Part 2:
  Non-alloy structural steels.*
- **EN 10210 / EN 10219** — *Hot-finished / cold-formed structural hollow
  sections.* (profile family mapping, not directly enforced here)
- **EN 10216-2** — *Seamless steel tubes for pressure purposes — Non-alloy
  and alloy steel tubes with specified elevated temperature properties.*
- **ASTM A36 / A36M-19** — *Carbon Structural Steel.*
- **ASTM A572 / A572M-18** — *High-Strength Low-Alloy Columbium-Vanadium
  Structural Steel.*
- **ASTM A500 / A500M-21** — *Cold-Formed Welded and Seamless Carbon Steel
  Structural Tubing in Rounds and Shapes.*
- **ASTM A240 / A240M** — *Chromium and Chromium-Nickel Stainless Steel
  Plate, Sheet, and Strip.* (source for AISI 304/316 limits)
- **ISO 6892-1** — *Metallic materials — Tensile testing at ambient
  temperature.* (the physical test behind the mechanical numbers)
- **ISO 148-1** — *Metallic materials — Charpy pendulum impact test.*

Israeli national context:

- **מפרט כללי 02 — מבני פלדה** (The "Blue Book" chapter 02, structural
  steel) — requires EN 10204 type 3.1 or better for every structural
  component on public construction projects.
- **ת"י 1225** — Israeli standard for structural steel (aligned to EN 10025).

---

## 8. Test Results — תוצאות בדיקות

Run `node --test test/manufacturing/material-cert.test.js` from the
`onyx-procurement/` directory.

```
tests 34   pass 34   fail 0   duration_ms ~122
```

Coverage by concern:

| Concern | Tests | Status |
|---|---|---|
| Cert storage (all 4 EN 10204 types) | 01–07 | PASS |
| Chemistry vs spec | 08, 09, 11, 13, 14 | PASS |
| Mechanical vs spec | 10 | PASS |
| Unknown-standard handling | 12 | PASS |
| Lot association + rebinding | 15–17 | PASS |
| Lot-level upstream trace | 18, 19 | PASS |
| Heat-number trace + normalisation | 20–22 | PASS |
| Revision history preservation | 22 | PASS |
| Search by standard | 23, 24 | PASS |
| Expiring-inventory 5-year flag | 25, 26 | PASS |
| CoC bundling + failure propagation | 27–30 | PASS |
| Audit log + catalog integrity | 31–34 | PASS |

---

## 9. Non-Deletion Invariants — חוסר-מחיקה

The module enforces four invariants verified by tests:

1. **Revised cert →** new version, old value preserved in `history[]` with
   original chemistry and mechanicals intact (test 22).
2. **Rebound lot →** old `certId` preserved in `lot.history[]` with a
   `rebindingAt` timestamp (test 17).
3. **Audit log →** only grows, every mutating call emits an entry
   (test 31).
4. **Frozen catalogs →** `EN10204_TYPES`, `STANDARD_SPECS`, and
   `ISRAELI_SUPPLIERS` are `Object.freeze`'d (test 32).

---

## 10. Future Upgrades (לא מוחקים רק משדרגים ומגדלים)

- **PDF ingestion** — OCR the attached mill-cert PDF and auto-populate
  chemistry/mechanical fields (pair with `onyx-procurement/src/ocr`).
- **BOM explosion** — link finished SKU → routing → lots → certs so the
  CoC is generated automatically from the work-order traveler.
- **NCR workflow** — feed `verifyAgainstStandard.pass = false` into the
  Non-Conformance Report module for quarantine and supplier debit.
- **Multi-heat pedigree graph** — when a lot is cut into sub-lots, chain
  those sub-lots back to the parent heat so the recall algorithm walks
  the whole tree.
- **XML/EDI import** — ArcelorMittal, SSAB and Outokumpu publish
  machine-readable cert files; add a parser tier so a PDF is the
  fallback, not the primary.
- **Signed digital certs** — treat the supplier PKI signature as
  authoritative and record the verification result alongside the PDF.
