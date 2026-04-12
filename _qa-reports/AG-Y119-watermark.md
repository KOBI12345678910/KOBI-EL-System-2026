# AG-Y119 — Document Watermark & Stamp Tool / כלי סימון מים וחותמות

**Agent**: Y-119
**Swarm**: Office Docs
**Date / תאריך**: 2026-04-11
**Status / סטטוס**: PASS — 27 / 27 tests green (100%)
**Module**: `onyx-procurement/src/docs/watermark.js`
**Tests**: `onyx-procurement/test/docs/watermark.test.js`

---

## 1. Scope / תחום

A pure metadata-overlay-spec generator for document watermarks. It does
**not** render pixels. A separate downstream PDF renderer will consume
the specs and burn them onto the real document.

| English | עברית |
|---|---|
| Produces overlay specs for PDFs and images | מייצר מפרטי שכבת-על לקבצי PDF ותמונות |
| Zero external deps (node:crypto only) | אפס תלויות חיצוניות (node:crypto בלבד) |
| Soft-remove only — nothing is ever deleted | הסרה רכה בלבד — לא מוחקים |
| Bilingual labels on every public structure | תוויות דו-לשוניות בכל מבנה ציבורי |

---

## 2. Immutable rules honoured / חוקים בל-יעברו

1. **"לא מוחקים רק משדרגים ומגדלים"** — `removeWatermark()` is a status
   flip to `hidden`; the underlying record and its audit log survive
   forever. A non-empty `justification` is mandatory.
2. **Zero external deps** — only `node:crypto` from Node's built-ins.
3. **Hebrew RTL + bilingual labels** — every enum entry carries both
   `he` and `en` fields. Confidentiality seals also expose a combined
   `bilingualText` of the form `<he> / <en>`.

---

## 3. Watermark types / סוגי סימני מים

| Type | `id` | English | עברית | Primary data |
|---|---|---|---|---|
| Visible | `visible` | Visible watermark | סימן מים גלוי | text, position, opacity, rotation, color, fontSize |
| Invisible | `invisible` | Invisible watermark | סימן מים סמוי | owner, timestamp, recipient, purpose → SHA-256 |
| Timestamp | `timestamp` | Timestamp | חותמת זמן | ISO / Hebrew / short |
| Confidentiality | `confidentiality` | Confidentiality seal | חותמת סיווג | 5 levels with bilingual labels + palette |
| Dynamic | `dynamic` | Dynamic watermark | סימן מים דינמי | template + context substitution |

---

## 4. Position grid / רשת מיקומים

All six visible-watermark positions, anchored to the page canvas:

```
+------------------+------------------+------------------+
| top-left         |                  | top-right        |
| שמאל-עליון      |                  | ימין-עליון       |
| x=left  y=top    |                  | x=right y=top    |
+------------------+------------------+------------------+
|                  | center           |                  |
|                  | מרכז             |                  |
|                  | x=center y=center|                  |
|                  |                  |                  |
|                  | diagonal 45deg   |                  |
|                  | אלכסון           |                  |
+------------------+------------------+------------------+
| bottom-left      |                  | bottom-right     |
| שמאל-תחתון       |                  | ימין-תחתון       |
| x=left y=bottom  |                  | x=right y=bottom |
+------------------+------------------+------------------+
```

| `id` | Hebrew | English | Anchor X | Anchor Y | Default rotation |
|---|---|---|---|---|---|
| `top-left` | שמאל-עליון | Top-left | left | top | 0 deg |
| `top-right` | ימין-עליון | Top-right | right | top | 0 deg |
| `bottom-left` | שמאל-תחתון | Bottom-left | left | bottom | 0 deg |
| `bottom-right` | ימין-תחתון | Bottom-right | right | bottom | 0 deg |
| `center` | מרכז | Center | center | center | 0 deg |
| `diagonal` | אלכסון | Diagonal | center | center | 45 deg |

Opacity must be in `[0, 1]` (default 0.5). The renderer interprets
`anchor` pairs; callers who bypass the helper can still supply a raw
`{x, y}` pair.

---

## 5. Confidentiality color palette / לוח צבעים של רמות סיווג

| Rank | `id` | עברית | English | Fill | Text | Material-design hex |
|---|---|---|---|---|---|---|
| 1 | `public` | ציבורי | Public | Green | White | `#2E7D32` on `#FFFFFF` |
| 2 | `internal` | פנימי | Internal | Blue | White | `#1565C0` on `#FFFFFF` |
| 3 | `confidential` | חסוי | Confidential | Orange | White | `#EF6C00` on `#FFFFFF` |
| 4 | `restricted` | מוגבל | Restricted | Red | White | `#C62828` on `#FFFFFF` |
| 5 | `secret` | סודי ביותר | Secret | Deep purple | White | `#4A148C` on `#FFFFFF` |

The `rank` is strictly increasing so downstream code can implement
"at-least" policies (e.g., `level.rank >= 3` → watermark must appear
on every page).

---

## 6. Timestamp formats / פורמטי חותמת זמן

| Format | `id` | עברית | Example output |
|---|---|---|---|
| ISO 8601 | `ISO` | ISO 8601 | `2026-04-11T08:15:30.000Z` |
| Hebrew (Gregorian) | `Hebrew` | עברי (גרגוריאני) | `גרגוריאני: 11 באפריל 2026 10:00` |
| Hebrew + עברי | `Hebrew` + `withJewish: true` | עברי + Jewish calendar | `גרגוריאני: 11 באפריל 2026 10:00  \|  עברי: 11 ניסן 5786` |
| Short | `short` | קצר | `11/04/2026` |

The Hebrew renderer uses a heuristic Gregorian→Jewish year mapping
(`gYear + 3760`) that is accurate to the year for 1900-2100; the
downstream PDF renderer replaces the month/day portion with a full
luach lookup when the document is actually materialised.

---

## 7. Dynamic template variables / משתני תבנית

Template strings use `{var_name}` syntax. Unknown variables are left
literal so callers can see exactly which placeholder was not filled.

| Placeholder | עברית | English |
|---|---|---|
| `{recipient}` | נמען | Recipient name |
| `{recipient_email}` | דוא"ל נמען | Recipient email |
| `{date}` | תאריך | Current date (auto-filled if missing) |
| `{doc_id}` | מזהה מסמך | Document id (auto-filled from argument) |
| `{owner}`, `{purpose}`, ... | נוסף | Any custom key in `context` |

Example:

```
Template:  "Sent to {recipient} <{recipient_email}> on {date} — ref {doc_id}"
Context:   { recipient: "Yossi Cohen", recipient_email: "yossi@partner.co.il" }
Rendered:  "Sent to Yossi Cohen <yossi@partner.co.il> on 2026-04-11 — ref DYN-1"
```

---

## 8. Integrity model / מודל שלמות

Every record carries two hashes:

| Field | Covers | Purpose |
|---|---|---|
| `integrityHash` | id + docId + type + createdAt + spec + metadata | Whole-record fingerprint (used by a future immutability audit) |
| `payloadHash` (invisible only) | the four metadata fields | Enables `verifyWatermark()` without disclosing the metadata |

`verifyWatermark(docId, expected)` recomputes the `payloadHash` from the
caller's expected metadata, walks the doc's active invisible watermarks
and returns `{ ok: true }` on match or `{ ok: false, reason: 'HASH_MISMATCH' }`
otherwise. The verdict is always recorded in the audit log.

---

## 9. Soft-remove contract / חוזה ההסרה הרכה

```
removeWatermark(docId, watermarkId, justification)
 → throws if justification is empty
 → flips record.status: 'active' → 'hidden'
 → sets record.hiddenAt + record.hiddenJustification
 → appends { action: 'soft-remove', payload: { previousStatus, justification } }
    to the audit log
 → the original spec (text, position, metadata, hashes) is preserved verbatim
```

The record is still returned by `extractWatermarks()`; callers render
only `status === 'active'` watermarks, but the historical copy remains
available for investigations.

---

## 10. API surface / ממשק

| Method | English | עברית |
|---|---|---|
| `applyVisibleWatermark(opts)` | Apply a visible text stamp | הוספת חותמת גלויה |
| `applyInvisibleWatermark(opts)` | Embed SHA-256 metadata | הטבעת מטא-דאטה סמוי |
| `applyTimestamp(opts)` | Apply a timestamp stamp | הוספת חותמת זמן |
| `applyConfidentialitySeal(opts)` | Apply a confidentiality seal | חותמת סיווג |
| `applyDynamicWatermark(opts)` | Dynamic templated stamp | סימן מים דינמי |
| `verifyWatermark(docId, expected)` | Verify invisible integrity | אימות שלמות |
| `extractWatermarks(docId)` | List all watermarks (active + hidden) | הצגת כל החותמות |
| `removeWatermark(docId, id, reason)` | Soft-remove (hide, audit) | הסרה רכה (הסתרה + תיעוד) |
| `bulkApply(docIds, spec)` | Batch apply across many docs | הפעלה מרובה |
| `auditTrail(docId)` | Full history, chronological | היסטוריה מלאה |

---

## 11. Test matrix / מטריצת בדיקות

`node --test test/docs/watermark.test.js` — **27 / 27 PASS** (well above the
18-test minimum).

| # | Category | Focus |
|---|---|---|
| 01-06 | Positions | All 6 positions (top-left, top-right, bottom-left, bottom-right, center, diagonal) |
| 07-08 | Validation | Unknown position and out-of-range opacity both throw |
| 09-10 | Invisible | Missing metadata field throws; SHA-256 payloadHash is stable |
| 11-14 | Timestamps | ISO, Hebrew (with גרגוריאני), Hebrew + עברי, short (dd/mm/yyyy) |
| 15-16 | Confidentiality | All 5 levels bilingual + strictly increasing rank; invalid level throws |
| 17-18 | Dynamic | Substitutes `{recipient}`/`{recipient_email}`/`{date}`/`{doc_id}`; unknown vars stay literal |
| 19-20 | Verify | Authentic metadata `ok=true`; tampered metadata `HASH_MISMATCH` |
| 21-23 | Remove | extractWatermarks includes hidden; soft-remove preserves record + audit; empty/missing justification throws |
| 24-25 | Bulk | Confidentiality seal across many docs; partial failures reported without aborting |
| 26 | Audit trail | Monotonic growth, chronological order, immutable to callers |
| 27 | Helper | `substituteTemplate` pure helper (missing context behaviour) |

Test run summary:

```
ℹ tests 27
ℹ pass 27
ℹ fail 0
ℹ duration_ms ~103
```

---

## 12. Hebrew glossary / מילון עברי

| English | עברית | Notes |
|---|---|---|
| Watermark | סימן מים | |
| Stamp / Seal | חותמת | |
| Visible watermark | סימן מים גלוי | |
| Invisible watermark | סימן מים סמוי | metadata + hash |
| Confidentiality level | רמת סיווג | 5-step ladder |
| Public | ציבורי | rank 1 |
| Internal | פנימי | rank 2 |
| Confidential | חסוי | rank 3 |
| Restricted | מוגבל | rank 4 |
| Secret | סודי ביותר | rank 5 |
| Top-left | שמאל-עליון | position |
| Top-right | ימין-עליון | position |
| Bottom-left | שמאל-תחתון | position |
| Bottom-right | ימין-תחתון | position |
| Center | מרכז | position |
| Diagonal | אלכסון | position, 45 deg |
| Opacity | שקיפות | [0,1] |
| Rotation | סיבוב | degrees |
| Integrity hash | גיבוב שלמות | SHA-256 |
| Hash mismatch | חוסר התאמה בגיבוב | verify failure |
| Authentic | אותנטי | verify success |
| Soft-remove | הסרה רכה | status flip to "hidden" |
| Justification | נימוק | mandatory on soft-remove |
| Audit trail | מסלול ביקורת | chronological history |
| Gregorian | גרגוריאני | secular calendar |
| Jewish calendar | לוח עברי | Hillel II cycle |
| Template | תבנית | `{var}` substitution |
| Recipient | נמען | |
| Owner | בעלים | |
| Purpose | מטרה | |

---

## 13. Downstream hand-off / העברה לרכיב העיבוד

The downstream PDF renderer (future Agent Y-12X) should consume a
watermark record as follows:

1. Read `record.status` — skip anything except `'active'`.
2. Branch on `record.type`:
   - `visible` → draw `spec.text` at `spec.anchor` with `spec.opacity`,
     `spec.rotation`, `spec.color`, `spec.fontSize`.
   - `invisible` → embed `metadata` + `payloadHash` into the PDF
     `/Info` dictionary or image XMP packet.
   - `timestamp` → draw `spec.rendered` in a small font at the footer.
   - `confidentiality` → draw `spec.bilingualText` with fill `spec.color`
     on `spec.textColor`, anchored via `spec.position`.
   - `dynamic` → draw `spec.rendered` (already substituted).
3. Re-compute `sha256(stableStringify(...))` and compare to
   `record.integrityHash` before rendering to guarantee the spec was
   not mutated in transit.

---

## 14. Verdict / פסק-דין

**PASS / עבר.** The module meets every requirement of the Y-119 brief:
six positions, five confidentiality levels with bilingual labels and a
dedicated color palette, three timestamp formats including Hebrew
(גרגוריאני + optional עברי), dynamic template substitution, SHA-256
verification, soft-remove with mandatory justification, bulk apply
with partial-failure reporting, and a chronological audit trail that is
immutable to callers. All 27 unit tests pass. No external dependencies
were introduced. No existing file was deleted or shrunk.
