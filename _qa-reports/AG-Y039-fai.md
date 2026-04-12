# AG-Y039 — First Article Inspection (AS9102)

**Agent:** Y-039 — Swarm Quality / Aerospace
**System:** Techno-Kol Uzi Mega-ERP (Israeli Metal Fab) — Wave 2026
**Module:** `onyx-procurement/src/quality/fai.js`
**Test:** `onyx-procurement/test/quality/fai.test.js`
**Date:** 2026-04-11
**Rule:** לא מוחקים רק משדרגים ומגדלים — never delete, only upgrade & grow.

---

## 1. Purpose — מטרת המודול

Implements **First Article Inspection** per the aerospace standard **AS9102
Rev C** (SAE International), adapted for Israeli metal-fabrication shops that
supply IAI, Elbit, Rafael, and sub-tier programs exporting to US/EU primes.

FAI is the documented verification that the **first piece** produced by a
given manufacturing process conforms to every characteristic (dimension,
note, specification, special process) shown on the engineering drawing and
associated documents. It is a contractual prerequisite for aerospace
procurement — no FAI, no acceptance.

Applies to:

| Situation | AS9102 Trigger | Constant |
|---|---|---|
| Brand-new part | first-ever production | `new-part` |
| Revision change | drawing revision bumped | `revision-change` |
| Supplier change | new supplier for same part | `supplier-change` |
| Manufacturing break | production gap > 2 years | `manufacturing-break` |
| Customer request | contractual special request | `customer-request` |

---

## 2. AS9102 Forms — Structure

AS9102 mandates three forms. This module emits them as structured JSON
objects (so any downstream PDF renderer can format them identically to
the SAE master templates).

### 2.1 Form 1 — Part Number Accountability

| Field | Hebrew | Source |
|---|---|---|
| Part Number | מספר חלק | `part.partNumber` |
| Part Name | שם חלק | `part.partName` |
| Drawing Number | מספר שרטוט | `drawing.drawingNumber` |
| Drawing Revision | גרסת שרטוט | `revision` |
| Manufacturing Process Ref | מסמך תהליך ייצור | `part.processRef` |
| Organization Name | שם ארגון | `supplier.legalName` |
| Supplier Code | קוד ספק | `supplier.supplierCode` |
| CAGE Code | קוד קייג' | `supplier.cageCode` |
| PO Number | מספר הזמנה | `purchaseOrder.poNumber` |
| PO Line Item | סעיף הזמנה | `purchaseOrder.lineItem` |
| Detail / Assembly FAI | FAI פרט / מכלול | `part.isAssembly` |
| Full / Partial FAI | FAI מלא / חלקי | derived from `fairReason` |
| Reason for Partial FAI | סיבה ל-FAI חלקי | populated when `partialFAI` |
| Baseline Part Number | מספר חלק בסיס | `part.baselinePartNumber` |
| Signature Block | חתימות | `preparedBy / preparedDate / approvedBy / approvedDate` |

### 2.2 Form 2 — Product Accountability

Three sub-sections:

1. **Raw Material** (חומר גלם) — `addMaterial({ name, specification, certificateOfConformance, heatNumber, lotNumber, supplier, acceptance })`.
   Captures traceability back to the mill certificate (תעודת מפעל).
2. **Specifications** (מפרטים) — `addSpecification({ code, title, revision })`.
   Lists every applicable spec (AS9100, MIL-I-45208, customer documents).
3. **Special Processes** (תהליכים מיוחדים) — `addSpecialProcess({ code, name, processSpec, supplier, approvalStatus, certificateNumber })`.
   Nadcap-relevant — anodizing, heat treat, welding, NDT, plating, paint.

### 2.3 Form 3 — Characteristic Accountability

The bulk of the inspection record. One row per characteristic:

| Column | Hebrew | Notes |
|---|---|---|
| Char No. | מספר מאפיין | Sequential ID `CHR-0001` |
| Bubble No. | מספר בועה | From inspection drawing |
| Type | סוג | `dimension` \| `note` \| `material` \| `process` \| `test` |
| Requirement | דרישה | Drawing description |
| Nominal | ערך נומינלי | Dimensional target |
| Tolerance | סבולת | `±X` \| `+X/-Y` \| ISO fit |
| Bounds | גבולות | Derived `{ lower, upper }` |
| Units | יחידות | `mm` / `in` / `Ra` / °C |
| Actual | ערך בפועל | Recorded by `recordResult` |
| Tool | כלי מדידה | CMM / caliper / micrometer |
| Inspector | בודק | Free text |
| Date | תאריך | ISO timestamp |
| Result | תוצאה | `accept` \| `reject` \| `pending` |
| Notes | הערות | Free text |

---

## 3. Public API

```js
const { FAIManager } = require('./src/quality/fai.js');
const mgr = new FAIManager({ mfgBreakYears: 2 });
```

| Method | Purpose |
|---|---|
| `createFAI({ part, drawing, revision, purchaseOrder, supplier, fairReason })` | Instantiate a draft FAI with empty Form 1/2/3 |
| `addMaterial(id, mat)` / `addSpecialProcess(id, p)` / `addSpecification(id, s)` | Fill Form 2 |
| `extractCharacteristics(drawingMetadata)` | Auto-generate Form 3 rows from CAD BOM / bubble notes / drawing notes |
| `addCharacteristic(id, char)` | Append to Form 3 |
| `recordResult(id, charId, { actualValue, toolUsed, date, inspector, result, notes })` | Record a measurement; auto-derives accept/reject from numeric bounds |
| `verdict(id)` | Overall PASS / FAIL / PENDING |
| `generateFormPDFs(id)` | Return `{ form1, form2, form3 }` structured payloads ready for a PDF renderer |
| `deltaFAI(previousFAI, currentFAI)` | Compute re-inspection scope per AS9102 §5.4 |
| `trackExpiry(faiId)` or `trackExpiry(supplier, part)` | Manufacturing-break (§4.6) validity check |
| `getFAI(id)` / `listFAIs()` | Read-only accessors (return clones) |

Exports:

```js
module.exports = {
  FAIManager,
  FAIR_REASONS,
  FAIR_REASON_LABELS,
  CHAR_TYPES,
  RESULT_VALUES,
  FORM_LABELS,
  GLOSSARY,
  DEFAULT_MFG_BREAK_YEARS,
  _internals: { parseTolerance },
};
```

---

## 4. Characteristic Extraction — CAD BOM / Bubble Notes

`extractCharacteristics(drawingMetadata)` consumes three complementary
input shapes, merges them in order, and returns an array of
characteristic records (not yet attached to any FAI — caller decides
where to route them).

| Input shape | Source | Output `type` |
|---|---|---|
| `bubbles[]` | Inspection drawing bubble numbers | `dimension` (or caller-provided) |
| `bomCharacteristics[]` | CAD BOM rows (surface finish, hardness, coating) | caller-provided or `dimension` |
| `notes[]` | Drawing notes block (e.g., "Break sharp edges 0.2×45°") | `note` (no bounds) |

Each characteristic record:

```js
{
  bubbleNumber,       // int
  type,               // 'dimension' | 'note' | 'material' | 'process' | 'test'
  description,        // EN
  descriptionHe,      // HE
  nominal,            // number | null
  tolerance,          // "±0.1" | "+0.05/-0" | ... | ""
  bounds,             // { lower, upper } | null
  units,              // "mm" | "in" | "Ra" | ...
  drawingZone,        // "A4"
}
```

The tolerance parser (`parseTolerance`) handles symmetric (`±`, `+/-`),
asymmetric (`+A/-B`), and single-sided (`+X`, `-Y`) forms. ISO fits
(`H7`, `h6`) return `null` — caller must supply explicit bounds from an
ISO table.

---

## 5. Verdict Logic

```
PASS    ⟺  at least one characteristic exists AND every result === 'accept'
FAIL    ⟺  any characteristic has result === 'reject'
PENDING  ⟺  no characteristics OR any characteristic is 'pending' (without a reject)
```

`verdict(id)` returns:

```js
{
  verdict: 'pass' | 'fail' | 'pending',
  reason: 'all-accepted' | 'characteristic-rejected' | 'incomplete' | 'no-characteristics',
  total: N, accepted: N, rejected: N, pending: N,
  label: { he: 'פסיקה כוללת', en: 'Overall Verdict' },
  labels: { pass, fail, pending },
}
```

Auto-derivation: when `recordResult` is called with a numeric
`actualValue` and the characteristic has numeric `bounds`, the result is
computed automatically as `bounds.lower <= actualValue <= bounds.upper ?
'accept' : 'reject'`. An explicit `result` parameter **always** overrides
the auto-derivation (used for visual defects, out-of-scope rejects).

---

## 6. Delta FAI Rules — AS9102 §5.4

A **delta FAI** re-verifies only the characteristics impacted by a
change, instead of repeating the full inspection. `deltaFAI(prev, curr)`
returns the diff:

```js
{
  isDelta: true,
  baselineFaiId, currentFaiId,
  revisionChanged,       // true iff drawingRevision differs
  supplierChanged,       // true iff supplierCode differs
  changes: {
    added:    [ charIds new on current ],
    removed:  [ charIds dropped from previous ],
    modified: [ { id, field, before, after } ],   // one entry per changed field
  },
  reinspectionRequired: [ charIds ],  // union of added + modified
  unchanged:            [ charIds ],  // may reference baseline FAI results
  note: { he, en },                   // AS9102 §5.4 citation
}
```

Characteristics are keyed by **bubble number** (fallback to char id) so
that a renamed bubble is still tracked. `modified` emits one diff per
changed field — `description`, `nominal`, `tolerance`, `units`, `type`,
or `bounds` (deep JSON comparison on the `{lower, upper}` object).

Governance rule: when `revisionChanged === true`, treat every
characteristic as suspect unless engineering explicitly narrows the
re-inspection list via a signed ECN.

---

## 7. Manufacturing-Break Expiry — AS9102 §4.6

Per AS9102 §4.6, an FAI is valid only while production continues. If the
gap between the last production event and the next PO exceeds
`mfgBreakYears` (default **2 years**), a new FAI is required. The
default is configurable per customer contract.

`trackExpiry(faiId)` — or `trackExpiry(supplier, part)` when you only
know the tuple — returns:

```js
{
  found: true,
  faiId: 'FAI-000042',
  lastManufacturedAt: '2026-01-01T00:00:00Z',
  mfgBreakYears: 2,
  expiresAt: '2028-01-01T00:00:00Z',
  expired: false,                        // or true
  daysRemaining: 123,                    // negative when expired
  reason: 'within-window' | 'manufacturing-break-exceeded' | 'no-fai-on-file',
  label: { he: 'הפסקת ייצור', en: 'Manufacturing Break' },
}
```

`(supplier, part)` lookup returns the **most-recent** matching FAI by
`createdAt`, so a new production run that creates a fresh FAI
automatically restarts the clock — the previous FAIs are preserved in
`listFAIs()` per the project's never-delete rule.

Clock injection: `new FAIManager({ clock: () => new Date('2029-06-01') })`
makes expiry behavior deterministic in tests.

---

## 8. Form Field Layout (PDF)

`generateFormPDFs(faiId)` returns three payloads shaped for a bilingual
A4-landscape PDF renderer. Each carries:

```js
{
  faiId, createdAt, status, fairReason, fairReasonLabel,
  verdict: { ... },
  expiry: { ... },
  generatedAt, bilingual: true,
  title: { he, en },
  header: { partNumber, drawingRevision, ... },
  body: <form1 | form2 | form3 cloned payload>,
  footer: { page: '1 of 3' | '2 of 3' | '3 of 3' },
}
```

Recommended bilingual PDF layout:

```
┌─────────────────────────────────────────────────────────┐
│  AS9102 Form 1 — Part Number Accountability             │  <- title.en
│  טופס 1 — אחריות מספר חלק                                │  <- title.he (RTL)
├─────────────────────────────────────────────────────────┤
│  Part No.: TKU-AERO-12345   Rev: A                      │
│  מספר חלק:                                                │
│  Supplier: SUP-042 / Ramat-Gan Metal Works              │
│  PO: PO-4500123 / Line 001                              │
├─────────────────────────────────────────────────────────┤
│  [x] New Part  [ ] Revision Change  [ ] Supplier Change │
│  [ ] Mfg Break [ ] Customer Request                     │
├─────────────────────────────────────────────────────────┤
│  Signatures: Prepared by _____  Date _____              │
│              Approved by _____  Date _____              │
└────────────────────────────────────  Page 1 of 3  ─────┘
```

Forms 2 and 3 follow the same header/body/footer skeleton. Because the
payload is pure data, any Node PDF library (pdfkit, puppeteer, jsPDF)
can render it without this module needing a runtime dependency.

---

## 9. Hebrew Glossary — מילון מונחים

Exported as `GLOSSARY` for reuse in UI translations:

| Key | Hebrew | English |
|---|---|---|
| `FAI` | בדיקת פריט ראשון | First Article Inspection |
| `characteristic` | מאפיין בדיקה | Characteristic |
| `bubble` | מספור בועה בשרטוט | Inspection Bubble |
| `delta` | FAI חלקי (דלתא) | Delta FAI |
| `purchaseOrder` | הזמנת רכש | Purchase Order |
| `drawing` | שרטוט | Drawing |
| `revision` | גרסת שרטוט | Drawing Revision |
| `specialProcess` | תהליך מיוחד | Special Process |
| `rawMaterial` | חומר גלם | Raw Material |
| `nominal` | ערך נומינלי | Nominal |
| `tolerance` | סבולת | Tolerance |
| `actual` | ערך בפועל | Actual Value |
| `tool` | כלי מדידה | Measurement Tool |
| `inspector` | בודק | Inspector |
| `accept` | קביל | Accept |
| `reject` | נפסל | Reject |
| `verdict` | פסיקה כוללת | Overall Verdict |
| `pass` | עבר | PASS |
| `fail` | נכשל | FAIL |
| `expiry` | פקיעת תוקף | Expiry |
| `mfgBreak` | הפסקת ייצור | Manufacturing Break |

Plus form titles (`FORM_LABELS.form1 / form2 / form3`) and FAIR reason
labels (`FAIR_REASON_LABELS['new-part']`, etc.).

---

## 10. Test Coverage

File: `test/quality/fai.test.js` — **48 tests, all passing**.

| Suite | Tests | Focus |
|---|:-:|---|
| `FAIManager.createFAI` | 7 | Form 1 structure, validation, fairReason enum, clone isolation, sequential IDs |
| `Form 2 — Product Accountability` | 3 | Raw material traceability, special-process approvals, specifications |
| `parseTolerance helper` | 8 | `±`, `+/-`, asymmetric, single-sided, empty, ISO fit, invalid inputs |
| `extractCharacteristics` | 5 | Bubbles / BOM / notes merge, purity, sequential bubble IDs, type validation |
| `recordResult + verdict` | 7 | Auto-accept/reject from bounds, explicit override, unknown char, PASS / FAIL propagation |
| `generateFormPDFs` | 1 | Three bilingual payloads with correct header / body / footer |
| `deltaFAI` | 5 | Added / removed / modified (tolerance + bounds) / identical / supplier change |
| `trackExpiry` | 6 | Within window, break > 2y, exact boundary, lookup by (supplier, part), no-FAI fallback, custom window |
| `non-destructive guarantees` | 3 | No delete methods, listFAIs retains history, audit trail grows |
| `Bilingual (HE + EN) support` | 3 | Glossary completeness, form labels, char types enum |

Run:
```bash
cd onyx-procurement
node --test test/quality/fai.test.js
```

Result: `tests 48 / pass 48 / fail 0 / duration ~128ms`.

---

## 11. Purity & Non-Destructiveness (לא מוחקים רק משדרגים ומגדלים)

1. **No delete methods** — there is no `deleteFAI`, `removeFAI`, or
   `remove*` anywhere in the module. Pinned by test
   `no delete method on manager`.
2. **Clone isolation on read** — `createFAI`, `getFAI`, `listFAIs` all
   return `JSON.parse(JSON.stringify(...))` clones, so callers cannot
   mutate the store by holding a reference. Pinned by test `returns a
   clone — mutating result does not affect store`.
3. **Audit trail is append-only** — every mutation (`createFAI`,
   `addCharacteristic`, `recordResult`, `addMaterial`, ...) appends an
   entry to `fai.audit[]`; nothing is ever replaced.
4. **History retained on supplier lookup** — `trackExpiry(supplier,
   part)` returns the latest match but older FAIs remain queryable via
   `listFAIs()` and `getFAI(id)`.
5. **Zero external dependencies** — only Node.js built-ins.

Upgrades (future waves) can add fields to the `form` payloads **without**
breaking this interface: existing tests pin the keys they care about,
not the full object.

---

## 12. AS9102 Reference Cross-Check

| Module behavior | AS9102 §  | Notes |
|---|---|---|
| Full FAI required for new parts | §4.1 | `fairReason: 'new-part'` → `fullFAI: true` |
| Partial / Delta FAI for revisions | §5.4 | `deltaFAI()` reinspectionRequired |
| Manufacturing break invalidation | §4.6 | `trackExpiry()` default 2y |
| Form 1 — Part Accountability | §5.1 | `fai.form1` |
| Form 2 — Product Accountability | §5.2 | `fai.form2` (materials / specs / special processes) |
| Form 3 — Characteristic Accountability | §5.3 | `fai.form3.characteristics[]` |
| Signature blocks | §5.6 | `form1.signatureBlock`, `form2.signatureBlock`, `form3.signatureBlock` |
| Change in supplier triggers new FAI | §4.5 | `fairReason: 'supplier-change'` + `deltaFAI.supplierChanged` |

For Nadcap special processes (NDT, anodizing, chem-film, heat-treat), the
`specialProcesses[].approvalStatus` and `certificateNumber` fields
provide the hook for downstream audit integration.

---

## 13. Files

| Path | Role |
|---|---|
| `onyx-procurement/src/quality/fai.js` | Business logic — `FAIManager`, tolerance parser, AS9102 forms, delta / expiry |
| `onyx-procurement/test/quality/fai.test.js` | Node `--test` suite, 48 tests |
| `_qa-reports/AG-Y039-fai.md` | **This report — never delete.** |

---

**Status:** GREEN — all 48 tests pass, no open issues.
**Signed-off:** Agent Y-039 — 2026-04-11.
