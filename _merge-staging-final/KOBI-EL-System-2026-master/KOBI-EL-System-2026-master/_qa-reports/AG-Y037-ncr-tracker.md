# AG-Y037 — NCR Tracker (Non-Conformance Report)

**Agent:** Y-037 — Swarm Quality
**System:** Techno-Kol Uzi Mega-ERP (Israeli metal fabrication) — Wave 2026
**Module:** `onyx-procurement/src/quality/ncr-tracker.js`
**Test:** `onyx-procurement/test/quality/ncr-tracker.test.js`
**Date:** 2026-04-11
**Rule:** לא מוחקים רק משדרגים ומגדלים — never delete, only upgrade & grow.

---

## 1. Purpose — מטרת המערכת

The **NCR Tracker** is the quality control backbone of the Techno-Kol Uzi
metal fabrication plant. Every non-conforming unit detected on the shop
floor, at incoming inspection, at internal audit, or returned by a customer
is logged as a **Non-Conformance Report (NCR)** — Hebrew: **דו"ח
אי-התאמה**. The module takes an NCR through its full lifecycle, drives the
Material Review Board (MRB) decision, records structured root-cause
analysis, links corrective action, aggregates cost of poor quality (CoPQ),
and feeds both the supplier scorecard (X-05) and the customer RMA engine
(X-32).

Quality systems implicated:
- ISO 9001:2015 §8.7 "Control of nonconforming outputs"
- ISO 9001:2015 §10.2 "Nonconformity and corrective action"
- IATF 16949 §8.7 / §10.2 (for automotive-grade customers)
- תקן ישראלי ת"י 9001 — the Israeli adoption

---

## 2. NCR Workflow — תהליך עבודה

```
 ┌────────────────┐    ┌────────────────┐    ┌────────────────┐
 │  1. Detection  │ →  │  2. Triage     │ →  │  3. MRB        │
 │  createNCR()   │    │  severity set  │    │  disposition() │
 └────────────────┘    └────────────────┘    └────────────────┘
                                                       │
        ┌──────────────────────────────────────────────┘
        ▼
 ┌────────────────┐    ┌────────────────┐    ┌────────────────┐
 │  4. Root-Cause │ →  │  5. CAPA Link  │ →  │  6. Verify &   │
 │  RCA()         │    │  linkToCAPA()  │    │     closeNCR() │
 └────────────────┘    └────────────────┘    └────────────────┘
        │                     │                     │
        ▼                     ▼                     ▼
   rcaHistory[]           capaHistory[]         audit trail
   (לא מוחקים)           (לא מוחקים)          (append-only)
```

**Parallel tracks during or after disposition:**
- **rmaGeneration()** — if source is `customer`, auto-create RMA via X-32.
- **supplierScorecard()** — if source is `supplier`, push quality event into X-05.
- **costOfPoorQuality()** — CoPQ rollup aggregates every dispositioned NCR.
- **trendAnalysis()** — Pareto by supplier, SKU, defect-code, work-center.

### 2.1 Status state machine

| Status | He | Transition |
|---|---|---|
| `open` | פתוח | initial (internal use only — auto-advanced in createNCR) |
| `triaged` | בטיפול | set automatically after defect enrichment |
| `mrb-pending` | ממתין ל-MRB | reserved for future async workflow hook |
| `dispositioned` | בוצעה הכרעה | after `disposition()` |
| `rca-done` | ניתוח שורש הושלם | after `rootCauseAnalysis()` |
| `linked-capa` | מקושר ל-CAPA | after `linkToCAPA()` |
| `closed` | סגור | after `closeNCR()` — CAPA effectiveness verified |

---

## 3. Disposition Types — סוגי הכרעת MRB

| Disposition | Hebrew | Typical use | CoQP category | Default unit cost (ILS) |
|---|---|---|---|---|
| `use-as-is` | שימוש כמות-שהוא | Minor cosmetic, customer concession | internal-failure | 5 |
| `rework` | תיקון חוזר | Weld repair, regrind, re-paint | internal-failure | 45 |
| `return-to-supplier` | החזרה לספק | Incoming material off-spec | external-failure | 12 |
| `scrap` | גריטה | Unrecoverable damage, safety critical | internal-failure | 120 |
| `downgrade` | שינוי סוג איכות | Sell as B-grade / alt. customer | internal-failure | 60 |

Costs are pre-filled from plant averages but **always overridable** per
NCR via `disposition(ncrId, action, { unitCost })`. Customer-source NCRs
are always classified as **external-failure** regardless of the chosen
disposition, because the non-conformance reached the customer.

### 3.1 Disposition supersede

Re-dispositioning an NCR does **not** erase the prior decision. Instead, a
`disposition-superseded` event is appended to the NCR's event log, and the
new disposition replaces the active one. This preserves the MRB audit trail
under the לא מוחקים rule.

---

## 4. RCA Methods — שיטות ניתוח שורש

### 4.1 5-Why (חמש פעמים למה)
Chain of "why" questions, minimum 1 level. Classic Toyota TPS tool.
```js
t.rootCauseAnalysis(ncrId, {
  method: '5-why',
  findings: { whys: ['missed SOP', 'operator new', 'training gap', ...] },
});
```

### 4.2 Fishbone / Ishikawa (אדרת דג)
Six-M categorization: Man, Machine, Method, Material, Measurement, Environment.
```js
t.rootCauseAnalysis(ncrId, {
  method: 'fishbone',
  findings: {
    categories: { man: [...], machine: [...], method: [...], ... },
  },
});
```

### 4.3 FMEA (Failure Mode & Effects Analysis)
Records each failure mode with severity × occurrence × detection. The
tracker computes **RPN = S × O × D** automatically when all three are
numeric.
```js
t.rootCauseAnalysis(ncrId, {
  method: 'fmea',
  findings: {
    failureModes: [
      { mode: 'lack of fusion', severity: 8, occurrence: 4, detection: 3 }
      // rpn = 96 auto-computed
    ],
  },
});
```

RCAs also support supersede — prior analyses move to `ncr.rcaHistory[]`.

---

## 5. Defect Code Catalog — קטלוג קודי אי-התאמה

The module ships with **22 Israeli standard defect codes** covering the
six primary metal-shop failure families. Every code is bilingual.

### 5.1 Families

| Family | Prefix | # | Hebrew |
|---|---|---|---|
| Dimensional | `IL-DIM-*` | 4 | מידות וגיאומטריה |
| Welding | `IL-WLD-*` | 5 | ריתוך |
| Surface | `IL-SRF-*` | 4 | גימור פני השטח |
| Material | `IL-MAT-*` | 3 | חומר גלם |
| Assembly | `IL-ASM-*` | 3 | הרכבה |
| Documentation | `IL-DOC-*` | 3 | תיעוד |

### 5.2 Customer-specific catalogs

Extend the catalog at runtime per customer (e.g., IDF / רכב / חשמל חברה):
```js
tracker.registerCustomerDefectCatalog('CUST-ARMY-01', {
  'MIL-STD-PAINT-A': { he: 'גוון צבאי חסר תקן', en: 'Military color non-spec' },
});
```
When a customer-sourced NCR uses a code from their catalog, the bilingual
labels resolve against the customer's catalog first, falling back to the
Israeli standard.

---

## 6. Severity Model — מודל חומרה

| Severity | Hebrew | Weight | Typical |
|---|---|---|---|
| `minor` | קל | 1 | Cosmetic scratch, minor dimensional drift inside tolerance band |
| `major` | בינוני | 5 | Rework required, fit/function affected but salvageable |
| `critical` | קריטי | 25 | Scrap, safety-critical, or regulatory fail |

**Worst-severity rule:** an NCR's "worst severity" is the maximum weight
across all its defects. This single value drives the supplier scorecard
and Pareto sort order.

---

## 7. Cost of Poor Quality (CoPQ) — עלות אי-איכות

### 7.1 Classification (Juran / ASQ)

| Category | Hebrew | When it applies |
|---|---|---|
| internal-failure | כשל פנימי | Caught in-house: rework, scrap, downgrade, concession |
| external-failure | כשל חיצוני | Reached customer OR caused by supplier (RTS) |
| appraisal | הערכה | Inspection & test cost (future hook) |
| prevention | מניעה | Training, PM, audits (future hook) |

### 7.2 Aggregation

```js
const coq = tracker.costOfPoorQuality({
  from: '2026-04-01T00:00:00Z',
  to:   '2026-04-30T23:59:59Z',
});
// → { total, byCategory, bySource, byDisposition, count }
```
Costs are **only** counted after disposition (so an open NCR contributes
zero to CoPQ until MRB decides). This mirrors accounting: you cannot book
a cost without a decision.

---

## 8. Supplier Scorecard — דוח ציון ספק

```js
const sc = tracker.supplierScorecard('SUP-100', {
  from: '2026-01-01', to: '2026-03-31',
});
```

Returns:
```js
{
  supplierId: 'SUP-100',
  ncrCount: 4,
  unitsAffected: 52,
  severityScore: 15,    // sum of worstSeverity weights
  cost: 640.00,          // ILS
  score: 70,             // 100 - severityScore * 2, floored at 0
  grade: 'C',
  breakdown: {
    bySeverity: { minor: 1, major: 3, critical: 0 },
    byDefect: { 'IL-MAT-003': 3, 'IL-DIM-001': 1 },
  },
}
```

### 8.1 Grade thresholds

| Grade | Score range | Severity headroom |
|---|---|---|
| A | 90–100 | 0–1 major |
| B | 80–89 | 2 major |
| C | 70–79 | 3 major |
| D | 60–69 | 4 major |
| F | 0–59 | 5+ major or 2+ critical |

### 8.2 X-05 side effect

When an NCR is dispositioned and its source is `supplier`, the tracker
calls `supplierEngine.recordQualityEvent()` (if injected). When the
scorecard is computed, it calls `supplierEngine.updateQualityScore()`.
Both calls are try/catch-wrapped — upstream failures surface through
the audit trail but do not throw.

---

## 9. Pareto Trend Analysis — ניתוח פארטו

```js
const pareto = tracker.trendAnalysis({
  dimension: 'supplier', // or 'sku' | 'defect-code' | 'work-center'
  period: { from: '2026-01-01', to: '2026-03-31' },
});
```

Returns a ranked list of buckets sorted by severity score (primary),
count (secondary), cost (tertiary). Each item carries:
- `severityScore`, `count`, `qty`, `cost`
- `pct` — % of total severity score
- `cumPct` — cumulative %
- `paretoCutoffIndex` — index of the last item within 80% cumulative score
  (the "vital few" — use these for CAPA prioritization)

---

## 10. Integration Hooks

| External system | Integration point | Method called |
|---|---|---|
| **X-05** — Supplier scoring | On supplier disposition + scorecard | `recordQualityEvent()`, `updateQualityScore()` |
| **X-32** — RMA engine | On `rmaGeneration()` | `createRma({ customerId, items, reason })` |
| **Y-038** — CAPA engine | On `linkToCAPA()` | `attachNCR(capaId, ncrId)` |

All three are **optional injections** via the constructor; when absent,
the tracker falls back to stubs (e.g., `RMA-STUB-${ncrId}`) so the module
remains fully testable in isolation.

---

## 11. Hebrew Glossary — מונחים

| Hebrew | English | Context |
|---|---|---|
| דו"ח אי-התאמה | Non-Conformance Report (NCR) | Core document |
| אי-התאמה | Non-conformance | Any deviation from spec |
| ועדת חומרים | Material Review Board (MRB) | Disposition authority |
| הכרעת MRB | Disposition | Decision recorded on NCR |
| שימוש כמות-שהוא | Use as-is (concession) | Disposition |
| תיקון חוזר | Rework | Disposition |
| החזרה לספק | Return to supplier | Disposition |
| גריטה | Scrap | Disposition |
| שינוי סוג איכות | Downgrade | Disposition |
| ניתוח שורש | Root-cause analysis (RCA) | Investigation |
| חמש פעמים למה | 5-Why | RCA method |
| אדרת דג | Fishbone (Ishikawa) | RCA method |
| ניתוח כשלים ותוצאותיהם | FMEA | RCA method |
| CAPA – פעולה מתקנת ומונעת | CAPA | Corrective / preventive action |
| עלות אי-איכות | Cost of Poor Quality (CoPQ) | Rollup |
| כשל פנימי | Internal failure | CoQP category |
| כשל חיצוני | External failure | CoQP category |
| ציון ספק | Supplier score | Scorecard |
| קל / בינוני / קריטי | Minor / Major / Critical | Severity levels |
| פארטו | Pareto | Trend analysis |
| בקבלה | Incoming inspection | NCR source |
| מהלקוח | Customer return | NCR source |
| פנים-מפעלי | Internal / in-process | NCR source |
| ביקורת פנימית | Internal audit | NCR source |
| ריתוך | Welding | Defect family |
| עיוות | Warpage | Defect |
| סדק בריתוך | Weld crack | Defect |
| נקבוביות | Porosity | Defect |
| חלודה | Rust / corrosion | Defect |
| גלוון | Galvanization | Defect |
| תעודת חומר | Mill certificate | Documentation |
| תעודת משלוח | Delivery note | Documentation |

---

## 12. Test Coverage

`test/quality/ncr-tracker.test.js` — **27 tests, 0 failures**

| # | Area | Tests |
|---|---|---|
| 1 | NCR lifecycle | 4 |
| 2 | Disposition (5 actions + supersede + override) | 4 |
| 3 | Cost of Poor Quality | 2 |
| 4 | Supplier scorecard (grades, side effects) | 3 |
| 5 | Pareto trend (4 dimensions) | 4 |
| 6 | RCA methods + CAPA link | 5 |
| 7 | RMA generation | 4 |
| 8 | Customer defect catalogs | 1 |

Command:
```bash
cd onyx-procurement
node test/quality/ncr-tracker.test.js
```
Output:
```
27 passed, 0 failed
```

---

## 13. "לא מוחקים רק משדרגים ומגדלים" Compliance

The module preserves history at every mutation:

| Op | History preservation |
|---|---|
| `disposition()` re-run | Event `disposition-superseded` with previous + next |
| `rootCauseAnalysis()` re-run | Prior RCA moved into `ncr.rcaHistory[]` |
| `linkToCAPA()` with new id | Prior id moved into `ncr.capaHistory[]` |
| Any call | Append-only entry in `ncr.events[]` and `_audit[]` |
| Dispose errors | Logged to event stream — never thrown silently |

There is **no** `delete`, `splice`, or `pop` anywhere in the module. The
`Map.delete()` method is not called on `_ncrs`. Every public method
returns deep clones to prevent external mutation.

---

## 14. Open / Follow-ups

1. **Appraisal & prevention CoQP** — the two non-failure CoQP categories
   are seeded but not yet fed (need wiring from inspection scheduler &
   training tracker).
2. **Photo storage** — `defect.photo` accepts a string reference (URL or
   asset id). When the asset store lands, bind into its lifecycle.
3. **MRB async workflow** — `mrb-pending` status is reserved for a future
   async MRB voting workflow (>1 approver required).
4. **Electronic signature on disposition** — hook for PKI sign-off when
   integrated with the audit-trail UI (X-98).
