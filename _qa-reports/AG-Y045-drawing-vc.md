# AG-Y045 — Drawing Version Control (DVC)

**Agent:** Y-045 — Swarm Manufacturing
**System:** Techno-Kol Uzi Mega-ERP (Israeli metal fab + real estate) — Wave 2026
**Module:** `onyx-procurement/src/manufacturing/drawing-vc.js`
**Test:** `onyx-procurement/test/manufacturing/drawing-vc.test.js`
**Date:** 2026-04-11
**Rule:** לא מוחקים רק משדרגים ומגדלים — never delete, only upgrade & grow.
**Test result:** 26 / 26 passing (`node --test test/manufacturing/drawing-vc.test.js`)

---

## 1. Purpose — מטרת המערכת

The shop floor at "טכנו-קול עוזי" cuts, bends, welds and machines from
engineering drawings authored in AutoCAD (DWG/DXF), SolidWorks/Inventor
(STEP/IGES) or PDF prints. A *single* wrong revision on the shop floor
means scrapped material, missed delivery and (worst case) a customer
audit non-conformance — the kind that voids ISO 9001 certification.

This module is the immutable single-source-of-truth for every drawing.
It assigns aerospace-style alpha revisions (A, B, C ... Z, AA, AB ...),
supports numeric sub-revs for minor tweaks (A.1, A.2 ...), enforces
QA + design-lead dual approval, freezes released drawings against
accidental supersede, and maintains bidirectional links to BOM and
work-order records so a downstream impact-analysis is one query away.

מודול זה הוא **מקור האמת היחיד** לכל שרטוט הנדסי במפעל. שיטת המספור
תואמת תעשייה אווירית (A, B ... Z, AA), תומכת בתת-גרסאות (A.1, A.2),
דורשת אישור כפול (QA + מהנדס ראשי), ומאפשרת **נעילה** (freeze) של
גרסה משוחררת כך שלא ניתן להחליפה ללא החלטה אנושית מפורשת.

---

## 2. Revision Numbering Scheme — שיטת מספור גרסאות

### 2.1 Major rev (alpha sequence)

Aerospace ECO practice — `A, B, C ... Z, AA, AB ... AZ, BA ... ZZ, AAA ...`.
Letters O and I are **kept** for compatibility with Israeli mechanical
drafting that does not skip them. To re-enable letter-skipping, edit the
`ALPHA` constant in `drawing-vc.js`; the rest of the algorithm is
alphabet-agnostic.

| Step | Resulting rev |
|---:|---|
| 1   | `A` |
| 26  | `Z` |
| 27  | `AA` |
| 28  | `AB` |
| 52  | `AZ` |
| 53  | `BA` |
| 702 | `ZZ` |
| 703 | `AAA` |

The bijection between alpha string and 1-based index is **proved by test**
across 1..1000 (`test 05`).

### 2.2 Sub-rev (numeric tweak)

Pass `subRev: true` to `uploadDrawing`. Sub-revs do **not** advance the
major counter and are formatted as `<MAJOR>.<N>`:

| Sequence | Trigger |
|---|---|
| `A` → `A.1` | minor revision (e.g. dimensional clarification, no geometry change) |
| `A.1` → `A.2` | another minor tweak |
| `A.2` → `B` | next call without `subRev` issues a new major |

Sub-revs are explicitly **allowed on top of a frozen major** (test 14)
because they represent tolerable corrections (typo, note clarification);
new major revs over a frozen rev require `{force:true}` (test 13).

### 2.3 Explicit rev override

For **migration imports** the caller can supply `rev: 'C'` directly.
The module will reject duplicate explicit revs (test 08).

### 2.4 No-op upload (content fingerprint match)

If the SHA-256 of the new buffer equals the SHA-256 of the latest
**non-superseded** rev, no new rev is created. Caller gets:

```json
{
  "created": false,
  "revision": { "rev": "A", ... },
  "reason_he": "תוכן זהה — לא נוצרה גרסה חדשה",
  "reason_en": "content identical — no new revision created"
}
```

This means a CI pipeline can re-upload the same artefact safely
(idempotent).

---

## 3. Approval Matrix — מטריצת אישורים

### 3.1 Required roles

| Role id        | Hebrew         | English          | Required? |
|---|---|---|:---:|
| `qa`           | בקרת איכות     | Quality Assurance| ✔ |
| `design-lead`  | מהנדס ראשי     | Design Lead      | ✔ |

Both roles **must** sign before status flips to `approved`. A single
approval flips status to `in-review`. Approvals are **append-only** —
calling `approveRevision()` with the same role twice records both
signatures (the second is recorded for audit, the first is **never**
removed).

### 3.2 Status lifecycle — מחזור חיי סטטוס

```
draft  → in-review → approved → frozen
   \________________\__________\______→ superseded (terminal)
```

| Status       | He                         | En                | Auto? |
|---|---|---|:---:|
| `draft`      | טיוטה                       | draft             | initial |
| `in-review`  | בבדיקה                      | in review         | first approval |
| `approved`   | מאושר                       | approved          | both approvals |
| `frozen`     | נעול / מוקפא                | frozen            | manual `freezeRevision` |
| `superseded` | הוחלף בגרסה חדשה            | superseded        | new upload OR `supersedeRevision` |

### 3.3 Freeze gate

Only an `approved` rev can be `frozen`. Once frozen:

- New uploads of the same part throw `cannot supersede frozen rev "..."`
  unless the caller passes `{force:true}` (which lays down a new major
  rev) **or** `{subRev:true}` (which allows a sub-rev tweak).
- The frozen record itself is **never** flipped to `superseded` — it
  retains the `frozen` label even after a newer rev exists, so that the
  audit trail clearly shows it was deliberately released.

This is the human-in-the-loop gate that protects shop-floor releases.

---

## 4. File Format Catalog — קטלוג פורמטי קבצים

| Format | Hebrew                          | English                            | Ext   | Standard ref          |
|---|---|---|---|---|
| `DWG`  | AutoCAD שרטוט בינארי            | AutoCAD binary drawing             | .dwg  | ISO 128 / ISO 7200    |
| `DXF`  | AutoCAD פורמט חילופי טקסט       | AutoCAD drawing exchange (text)    | .dxf  | ISO 128               |
| `PDF`  | תדפיס שרטוט להפצה               | Released print for distribution    | .pdf  | ISO 128 / ISO 7200    |
| `STEP` | מודל תלת-ממדי ניטרלי STEP       | Neutral 3D solid-model exchange    | .step | ISO 10303-242 (AP242) |
| `IGES` | פורמט חילופי מודל מורשת          | Legacy CAD interchange             | .iges | ANSI Y14.26M          |

Unknown formats are rejected at upload time (test 24).

---

## 5. Checksum Algorithm — אלגוריתם טביעת אצבע

- **Algorithm:** SHA-256 (Node built-in `crypto.createHash('sha256')`).
- **Output:** 64-char lowercase hex string.
- **Input handling:** any `Buffer`, or any `string` (UTF-8 encoded).
- **Stable for binary safety:** the buffer is hashed byte-for-byte; no
  normalisation, no trimming. A whitespace-only change in a DXF text
  file produces a different hash, which is the expected behaviour for
  a strict version-control system.

The choice of SHA-256 is consistent with the rest of the Mega-ERP
(material-cert audit log, signatory-workflow stamp, audit-retention
hash chain) and is FIPS 180-4 compliant.

---

## 6. Integration Points — נקודות אינטגרציה

DrawingVC ships **bidirectional descriptors** (mock-transport pattern):
the drawing side stores the foreign id, and the returned object
instructs the foreign module how to record the reverse link. Zero
external dependencies, zero hard wiring.

| Direction        | Method                                  | Returned reverse-link instruction |
|---|---|---|
| Drawing → BOM    | `linkToBOM(part, rev, bomId)`           | "BOM `<id>` should record drawing `<part>/<rev>`" |
| Drawing → WO     | `linkToWorkOrder(part, rev, woId)`      | "WO `<id>` should record drawing `<part>/<rev>`" |

### 6.1 Suggested integration partners (existing onyx-procurement modules)

- `bom-manager.js` — call `linkToBOM` from BOM creation flow
- `wo-scheduler.js` — call `linkToWorkOrder` when releasing a WO
- `routing-manager.js` — read `getDrawing(part)` to fetch the active rev
- `qc-checklist.js` — block QC sign-off if drawing rev is not `approved`
- `material-cert.js` (Y-044) — bind cert lots to the drawing rev they were
  fabricated against
- `welder-certs.js` (Y-043) — verify welder authorisation against the
  process spec referenced on the active drawing rev

### 6.2 Watermark hand-off

`watermark(buffer, text)` does **not** rasterise PDFs (zero deps).
Instead it appends a textual metadata footer:

```
%%WATERMARK-START
%%TEXT: שליטת גרסה · Version Control
%%STAMPED_AT: 2026-04-11T...
%%WATERMARK-END
```

Downstream PDF/print pipelines (e.g. a future `pdf-stamp` micro-service)
can parse this footer and render an actual visible watermark. The
function returns `{ buffer, stamp, text, originalSize, annotatedSize }`
so the caller can either ship the annotated buffer or attach the stamp
as a sidecar file — whichever fits the pipeline.

---

## 7. Public API — ממשק ציבורי

| Method | Description |
|---|---|
| `uploadDrawing({partNumber, rev?, fileBuffer, format, author, notes?, subRev?, force?})` | Compute SHA-256, decide rev, append revision |
| `getDrawing(partNumber, rev?)` | Latest non-superseded, or specific rev, or `null` |
| `listRevisions(partNumber)` | Full audit history (incl. superseded) |
| `compare(rev1, rev2)` | Checksum + size + metadata diff with bilingual summary |
| `approveRevision(partNumber, rev, approver, role)` | Append signature; flips status when both roles signed |
| `freezeRevision(partNumber, rev)` | Mark immutable (requires `approved` status) |
| `supersedeRevision(partNumber, rev, reason?)` | Manual supersede; record kept forever |
| `linkToBOM(partNumber, rev, bomId)` | Bidirectional drawing ↔ BOM link |
| `linkToWorkOrder(partNumber, rev, woId)` | Bidirectional drawing ↔ WO link |
| `watermark(buffer, text?)` | Append bilingual metadata footer; returns `{buffer, stamp, ...}` |
| `exportHistoryReport(partNumber)` | Bilingual markdown audit trail |
| `search(query, {partNumber, author, dateRange, status})` | Multi-field text search |

`compare()` accepts both shorthand string `"PART/REV"` and the long
form `{partNumber, rev}`.

---

## 8. Test Coverage — כיסוי בדיקות

| # | Test | Concern |
|---:|---|---|
| 01 | first upload creates rev `A` | basic creation |
| 02 | identical content does NOT create a new rev | idempotency |
| 03 | changed content creates rev `B` | major-rev increment + supersede |
| 04 | alpha rev generator A→Z→AA→AB→AZ→BA→ZZ→AAA | sequence math |
| 05 | alpha ⇄ index bijection across 1..1000 | sequence math |
| 06 | sub-rev A→A.1→A.2 | minor-tweak path |
| 07 | explicit rev override (`rev: 'C'`) | migration imports |
| 08 | duplicate explicit rev throws | safety |
| 09 | single approval → in-review only | dual-approval rule |
| 10 | both approvals → approved | dual-approval rule |
| 11 | invalid approval role rejected | RBAC |
| 12 | freezeRevision requires approved | gating |
| 13 | frozen rev blocks supersede; `force:true` allows | freeze gate |
| 14 | frozen rev allows sub-rev without force | tolerable tweaks |
| 15 | compare reports checksum + size diff with bilingual summary | diff API |
| 16 | linkToBOM bidirectional descriptor | integration |
| 17 | linkToWorkOrder bidirectional descriptor | integration |
| 18 | watermark appends bilingual stamp, original untouched | watermark |
| 19 | exportHistoryReport bilingual markdown + standards | reporting |
| 20 | search by partNumber/author/status/free-text | search |
| 21 | audit log grows monotonically | audit chain |
| 22 | supersedeRevision keeps record forever | RULE: never delete |
| 23 | getDrawing null for unknown part | safety |
| 24 | unknown format rejected | safety |
| 25 | cannot approve a superseded rev | safety |
| 26 | DRAWING_FORMATS catalog completeness | spec coverage |

**Result: 26 / 26 passing.**

```
$ node --test test/manufacturing/drawing-vc.test.js
ℹ tests 26
ℹ pass 26
ℹ fail 0
ℹ duration_ms ~120
```

---

## 9. Hebrew Glossary — מילון מונחים

| Hebrew                 | English                | Context |
|---|---|---|
| שרטוט הנדסי            | engineering drawing    | core artefact |
| גרסה / רביזיה          | revision               | a single immutable record |
| מספר חלק               | part number            | natural key |
| טביעת אצבע             | fingerprint / checksum | SHA-256 hex |
| תוכן זהה               | identical content      | no-op upload |
| אישור                  | approval / sign-off    | append-only signature |
| בקרת איכות (QA)        | Quality Assurance      | required role |
| מהנדס ראשי             | Design Lead            | required role |
| נעילה / הקפאה          | freeze                 | immutable release gate |
| הוחלף בגרסה חדשה        | superseded             | terminal status |
| רשימת חומרים (BOM)     | Bill of Materials      | linked entity |
| הזמנת עבודה            | Work Order             | linked entity |
| חותמת מים              | watermark              | bilingual stamp |
| מסלול ביקורת           | audit trail            | append-only log |
| תקן                    | standard               | ISO/ASME reference |
| מידוד גיאומטרי וסיבולות (GD&T) | Geometric Dimensioning & Tolerancing | ASME Y14.5 |
| תת-גרסה                | sub-revision           | A.1, A.2, ... |
| העברת קבצים מורשת      | legacy file interchange| IGES |
| רביזיית הנדסה          | Engineering Change Order (ECO) | aerospace term |
| מקור האמת היחיד        | single source of truth | DVC role |

---

## 10. Standards Reference — תקני ייחוס

| Standard | Scope | Used by |
|---|---|---|
| **ISO 128**       | General principles of presentation in technical drawings | DWG/DXF/PDF format catalogue |
| **ISO 2768**      | General tolerances for linear and angular dimensions     | implicit on every drawing |
| **ASME Y14.5**    | Geometric Dimensioning and Tolerancing (GD&T)            | feature control frames |
| **ISO 7200**      | Title blocks for technical product documentation         | PDF release prints |
| **ISO 10303-242** | STEP AP242 — managed model based 3D engineering          | STEP format catalogue |
| **ANSI Y14.26M**  | Engineering drawings and related documentation practices | IGES legacy interchange |
| **EN 10204**      | Inspection documents for metallic products               | cross-referenced in `material-cert.js` (Y-044) |
| **SAE AS9102**    | First Article Inspection                                 | downstream consumer (FAI form binds to drawing rev) |
| **ISO 9001**      | Quality management — document control clause 7.5         | rationale for the freeze gate |

---

## 11. Compliance Notes — הערות תאימות

- **לא מוחקים רק משדרגים ומגדלים** — verified by `test 22`. The
  `supersedeRevision` and `uploadDrawing` paths flip a status flag but
  never call `Map.delete` or `Array.splice`. Frozen revisions are
  immune to all auto-supersede paths.
- **Zero deps** — only `node:crypto` is imported. No `npm` packages.
- **Bilingual labels on every public structure** — every status, role,
  format and report line carries both `_he` and `_en` fields (or
  bilingual prose for reports).
- **Mock-transport pattern** — `linkToBOM` / `linkToWorkOrder` return
  reverse-link descriptors instead of calling foreign modules
  directly. This keeps the module standalone and testable.
- **Audit log monotonic** — verified by `test 21`. Each event carries
  a 1-based `seq`, an ISO timestamp and the action payload.
- **RBAC** — only the two whitelisted roles (`qa`, `design-lead`) can
  approve. Anything else throws (`test 11`).

---

## 12. Out of scope (future agents)

- Actual PDF/PNG rendering of the watermark — requires a binary PDF
  toolkit. Today the watermark is a textual footer parseable by
  downstream services.
- Visual diff (geometry overlay) for DWG/STEP — requires a CAD
  kernel. Today the diff is checksum + size + metadata only.
- Cross-tenant access control on the in-memory `Map` — RBAC is
  enforced at the approval step only; multi-tenant isolation is
  expected to be layered above this module by the API gateway.

---

_Generated by Agent Y-045 — Swarm Manufacturing — 2026-04-11_
_שליטת גרסה · Version Control_
