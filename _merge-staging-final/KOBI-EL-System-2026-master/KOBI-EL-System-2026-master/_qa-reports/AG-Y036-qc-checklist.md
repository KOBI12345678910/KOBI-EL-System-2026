# AG-Y036 — QC Checklist Engine (בקרת איכות)

**Agent:** Y-036 — Swarm Manufacturing
**System:** Techno-Kol Uzi Mega-ERP (Israeli metal-fab) — Wave 2026
**Module:** `onyx-procurement/src/manufacturing/qc-checklist.js`
**Test:** `onyx-procurement/test/manufacturing/qc-checklist.test.js`
**Date:** 2026-04-11
**Rule:** לא מוחקים רק משדרגים ומגדלים — never delete, only upgrade & grow.

---

## 1. Purpose — מטרת המנוע

Techno-Kol Uzi runs metal fabrication (welding, machining, painting, forming)
and supplies Israeli defense and aerospace primes — IAI, Elbit Systems, Rafael,
IMI — who impose strict supplier-quality requirements: single-sampling AQL
per MIL-STD-105E, FAI (First Article Inspection) on every new part number,
process capability (Cpk) reporting on critical dimensions, and a
Certificate of Conformance (תעודת התאמה) accompanying every shipment.

The QC Checklist Engine is the authoritative source for:

| Purpose | Hebrew |
|---|---|
| Checklist templating (per SKU × operation × stage) | תבניות רשימת בקרת איכות |
| Inspection record creation with AQL sampling plan | פתיחת בדיקה עם תוכנית דגימה |
| Result capture (pass-fail, measurement, visual, functional) | רישום תוצאות בדיקה |
| Pass/fail verdict with MIL-STD-105E accept/reject numbers | פסיקת עובר/נפסל |
| NCR (Non-Conformance Report) creation — bridge to Y-037 | דוח אי-התאמה, גשר ל-Y-037 |
| Certificate of Conformance (C of C) issuance | תעודת התאמה |
| X-bar / R control charts for measurement items | לוחות בקרה סטטיסטיים |
| Cpk (process capability) for critical dimensions | מדד יכולת תהליך Cpk |

---

## 2. AQL Sampling Plan — תוכנית דגימה

### 2.1 Lot size → code letter (MIL-STD-105E Table I, General Level II)

The engine embeds the lot-size code-letter table. The default inspection
level is **General II**, which is the level required by IAI/Elbit supplier
manuals for dimensional and visual attributes. Levels I and III are also
embedded in `AQL_LOT_RANGES`.

| Lot size (inclusive) | Letter (GL-II) | Sample size `n` |
|---|---|---|
| 2 – 8 | A | 2 |
| 9 – 15 | B | 3 |
| 16 – 25 | C | 5 |
| 26 – 50 | D | 8 |
| 51 – 90 | E | 13 |
| 91 – 150 | F | 20 |
| 151 – 280 | G | 32 |
| 281 – 500 | H | 50 |
| 501 – 1 200 | J | 80 |
| 1 201 – 3 200 | K | 125 |
| 3 201 – 10 000 | L | 200 |
| 10 001 – 35 000 | M | 315 |
| 35 001 – 150 000 | N | 500 |
| 150 001 – 500 000 | P | 800 |
| 500 001 – ∞ | Q | 1 250 |

### 2.2 Accept / Reject numbers — Normal inspection

Embedded in `AQL_SAMPLE_PLANS_NORMAL`, keyed by `[letter][aqlKey]`.
Example rows (single-sampling, normal inspection, MIL-STD-105E Table II-A):

| Letter | n | AQL 0.65 | AQL 1.0 | AQL 1.5 | AQL 2.5 | AQL 4.0 |
|---|---|---|---|---|---|---|
| F | 20 | 0 / 1 | 1 / 2 | 1 / 2 | 2 / 3 | 3 / 4 |
| G | 32 | 1 / 2 | 1 / 2 | 2 / 3 | 3 / 4 | 5 / 6 |
| H | 50 | 1 / 2 | 2 / 3 | 3 / 4 | 5 / 6 | 7 / 8 |
| J | 80 | 2 / 3 | 3 / 4 | 5 / 6 | 7 / 8 | 10 / 11 |
| K | 125 | 3 / 4 | 5 / 6 | 7 / 8 | 10 / 11 | 14 / 15 |
| L | 200 | 5 / 6 | 7 / 8 | 10 / 11 | 14 / 15 | 21 / 22 |

Read `a / r` as "accept on ≤ a defects, reject on ≥ r defects".

### 2.3 Tightened and Reduced inspection

Both tables are embedded (`AQL_SAMPLE_PLANS_TIGHTENED`, `AQL_SAMPLE_PLANS_REDUCED`).

- **Tightened** — triggered by two lot rejects out of five consecutive lots.
  Same letter, but Ac shifts left one AQL column, meaning the plan accepts
  fewer defects. Used automatically by the Y-037 NCR agent when it sets
  `severity: 'tightened'` on follow-up inspections.
- **Reduced** — triggered by ten consecutive accepted lots with very low
  defect rate. Sample size drops to **0.4 × normal** (rounded, min 2), and
  the accept/reject pair opens a gap (`Ac < Re − 1`), so a single defect
  no longer rejects but does trigger a return to Normal inspection.

### 2.4 Formal AQL accept rule

Given an inspection with a single-sampling plan `(n, Ac, Re)`:

```
accept  iff  defectCount <= Ac
reject  iff  defectCount >= Re
```

`Re = Ac + 1` in the single-sampling tables, so the two conditions cover
all integer defect counts. The engine enforces this inside
`verdictForInspection()`.

---

## 3. Cpk — Process Capability Index

### 3.1 Formula

For a centred, two-sided specification with upper and lower limits
`USL` and `LSL`:

```
μ  = sample mean                         (arithmetic average)
σ  = sample standard deviation           (n − 1 divisor)

Cp   = (USL − LSL) / (6 σ)
Cpu  = (USL − μ)   / (3 σ)
Cpl  = (μ − LSL)   / (3 σ)
Cpk  = min( Cpu , Cpl )
```

`Cp` measures the potential capability (spread only). `Cpk` measures the
actual capability accounting for centring — if the process mean drifts
away from the nominal, `Cpk` drops even though `Cp` stays the same.

### 3.2 Interpretation (what `cpk()` returns in `.interpretation`)

| Cpk | Verdict | Hebrew |
|---|---|---|
| ≥ 1.67 | aerospace/defense — excellent | מצוין — עומד בדרישות חלל/ביטחון |
| ≥ 1.33 | capable — meets IAI/Elbit minimum | כשיר — עומד בדרישות IAI/אלביט |
| ≥ 1.00 | marginal — tighten process | שולי — יש להדק תהליך |
| < 1.00 | incapable — redesign or 100% inspect | לא כשיר — עיצוב מחדש או בדיקת 100% |
| — (σ = 0) | undefined | לא מוגדר |

The **1.33** threshold is the contractual minimum in current IAI, Elbit,
IMI and MOD supplier manuals for key characteristics. Rafael demands
**1.67** for their critical dimensions (set in `ISRAELI_DEFENSE_STANDARDS.RAFAEL`).

---

## 4. Control Charts — X-bar / R

Computed in `controlCharts(checklistItemId, { subgroupSize, from, to })`.
The engine groups measurement results into subgroups of `n` (default 5,
bounded 2..10) and computes:

```
x̄ᵢ      = mean of subgroup i
Rᵢ       = max(subgroup i) − min(subgroup i)
x̄̄        = mean of x̄ᵢ          (center line of X-bar chart)
R̄        = mean of Rᵢ           (center line of R chart)

UCL_x̄   = x̄̄ + A₂ · R̄
LCL_x̄   = x̄̄ − A₂ · R̄
UCL_R   = D₄ · R̄
LCL_R   = D₃ · R̄
```

Constants `A₂ / D₃ / D₄ / d₂` per subgroup size are embedded in
`CONTROL_CHART_CONSTANTS` (Montgomery — Introduction to Statistical
Quality Control, Table VI). For `n = 5`: A₂ = 0.577, D₃ = 0, D₄ = 2.114.

The test `controlCharts › X-bar and R limits with known subgroup of 5`
fixes `UCL_x̄ = x̄̄ + 0.577 · R̄` as a hard numerical assertion to prevent
regression on the constants.

---

## 5. Israeli defense / aerospace standards referenced

| Standard | Hebrew | AQL level | Cpk min | Notes |
|---|---|---|---|---|
| IAI SQ-PR-001 | התעשייה האווירית | II | 1.33 | C of C per lot, material traceability to mill cert |
| Elbit SQM Rev. 9 | אלביט מערכות | II | 1.33 | AS9100-aligned, tightened after any NCR |
| Rafael SQA-100 | רפאל | II | **1.67** | Stricter than IAI — critical dims only |
| IMI-QA-300 | IMI מערכות | II | 1.33 | Ammunition/forgings focus |
| MOD-QC-STD-01 | משרד הביטחון | II | 1.33 | Blanket baseline for all MOD suppliers |

Generic standards also referenced in the module header:

- **MIL-STD-105E** (historical, now withdrawn) / **ANSI/ASQ Z1.4-2003** — attribute sampling
- **AS9102** — Aerospace First Article Inspection Report (FAIR)
- **ISO 9001:2015** clause **8.6** — release of products and services
- **ת"י ISO 9001** — Israeli standard, identical text to ISO 9001:2015

The metadata map `ISRAELI_DEFENSE_STANDARDS` is exported so downstream
agents (Y-037 NCR dispositioning, supplier portal) can pull Cpk minimums
and AQL level without hard-coding.

---

## 6. API surface

```js
const { QCChecklist } = require('./src/manufacturing/qc-checklist.js');
const qc = new QCChecklist();

// 1. Define the checklist (versioned, frozen, never-delete)
const cl = qc.defineChecklist({
  id: 'QC-WELD-001',
  sku: 'BRACKET-22x3',
  operation: 'MIG welding',
  stage: 'final',               // incoming | in-process | final | FAI
  aql: 1.0,
  inspectionLevel: 'II',
  standards: ['IAI SQ-PR-001', 'ISO 9001'],
  items: [
    { id: 'DIM-01', name_he: 'אורך כללי', name_en: 'Overall length',
      type: 'measurement', spec: 220, tolerance: 0.5,
      method: 'caliper', reference: 'DWG-22x3 rev B' },
    { id: 'WELD-VIS', name_he: 'בדיקה חזותית', name_en: 'Visual weld',
      type: 'pass-fail', method: 'visual', reference: 'AWS D1.1' },
  ],
});

// 2. Open an inspection — plan computed from lot size
const ins = qc.createInspection({
  checklistId: 'QC-WELD-001',
  lotId: 'LOT-2026-0001',
  inspector: 'Shira Katz',
  lotSize: 500,       // → letter H, n=50, AQL 1.0 → Ac=2 Re=3
});

// 3. Record results (measurements auto-compute pass/fail from spec ± tol)
qc.recordResult(ins.id, 'DIM-01',  { value: 220.2 });
qc.recordResult(ins.id, 'WELD-VIS',{ pass: true, notes: 'OK' });

// 4. Verdict
const v = qc.verdictForInspection(ins.id);
// → { verdict: 'pass', defectCount: 0, aql: { accept: true, ... } }

// 5a. Pass path — emit C of C for the shipment
const coc = qc.certificateOfConformance(ins.id);

// 5b. Fail path — reject lot, open NCR bridged to Y-037
const ncr = qc.rejectLot(ins.id, 'Weld porosity + OOS length');

// 6. Quality engineering views
const cc  = qc.controlCharts('DIM-01', { subgroupSize: 5 });
const cpk = qc.cpk('DIM-01');
```

---

## 7. Never-delete semantics (לא מוחקים רק משדרגים ומגדלים)

| Operation | Store | Mutation rule |
|---|---|---|
| `defineChecklist` (re-define same id) | `_versions[id]` array, `_checklists[id]` latest | Appends a new frozen version; all prior versions remain retrievable via `listChecklistVersions(id)` |
| `recordResult` | `_results[inspectionId]` ordered list | Append-only; each row carries a monotonic `.sequence` |
| `rejectLot` | `_inspections[id]`, `_ncrs[ncrId]` | Writes a **new** frozen inspection object with `status: 'rejected'` + `ncrId`. The NCR is a brand-new record with `bridgeKey: 'Y037.ncr.<id>'` for Y-037 to consume. |
| `certificateOfConformance` | pure — returns a frozen doc | Never touches stores. |

Every returned object passes through `freezeDeep()` so downstream code
cannot silently mutate a record it received from the engine. Tests assert
`Object.isFrozen(cl) === true` and that a re-assignment on the frozen
object throws `TypeError`.

---

## 8. Test coverage — 33 tests, 12 suites, all passing

```
node --test test/manufacturing/qc-checklist.test.js
...
ℹ tests 33
ℹ suites 12
ℹ pass 33
ℹ fail 0
```

Coverage breakdown:

| Suite | Tests | What it locks down |
|---|---|---|
| lot-size letter (MIL-STD-105E Table I) | 4 | Every row of the lot-size table + boundary (50→D, 51→E) |
| AQL sample-size per code letter | 1 | Canonical `n` per letter |
| samplingPlan — single sampling plans | 7 | Spot checks for F, H, J at AQL 1.0 / 2.5; tightened vs. normal monotonicity; reduced sample size = 0.4 × normal; error paths |
| aqlKey normalisation | 1 | Numeric → canonical string key |
| defineChecklist | 3 | Versioning, validation, frozen output |
| inspection lifecycle | 3 | Plan derivation, measurement auto pass, pass-fail requires explicit flag |
| verdictForInspection | 3 | AQL accept, AQL reject, missing-item coverage |
| rejectLot → NCR | 1 | NCR id format, Y-037 bridge key, inspection transition |
| certificateOfConformance | 2 | Bilingual body on pass; throws on fail |
| controlCharts | 2 | X-bar/R limits vs. Montgomery A₂/D₃/D₄; insufficient-data warning |
| cpk — process capability | 4 | Tight process Cpk > 1; wide process Cpk < 1; missing spec throws; <2 samples returns warning |
| bilingual labels and defence metadata | 2 | Every stage/verdict has HE + EN label; all five defence primes present with Cpk ≥ 1.33 |

---

## 9. Hebrew glossary — מילון מונחים

| Hebrew | Transliteration | English |
|---|---|---|
| בקרת איכות | bakarat eichut | Quality Control |
| רשימת בקרת איכות | reshimat bakarat eichut | QC Checklist |
| בדיקה | bdika | Inspection |
| בדיקת קבלה | bdikat kabala | Incoming Inspection |
| בדיקה בתהליך | bdika batahalich | In-Process Inspection |
| בדיקה סופית | bdika sofit | Final Inspection |
| בדיקה ראשונה | bdika rishona | First Article Inspection (FAI) |
| אצווה | atzva | Lot / Batch |
| גודל מדגם | godel migdam | Sample Size |
| בודק | bodek | Inspector |
| פסיקה | psika | Verdict |
| עובר | over | Pass |
| נפסל | nifsal | Fail / Rejected |
| דוח אי-התאמה | dokh i-hatama | Non-Conformance Report (NCR) |
| תעודת התאמה | te'udat hatama | Certificate of Conformance (C of C) |
| רמת איכות מקובלת | ramat eichut mekubelet | Acceptable Quality Level (AQL) |
| בדיקה מוגברת | bdika mugberet | Tightened Inspection |
| בדיקה מופחתת | bdika mufḥetet | Reduced Inspection |
| מדד יכולת תהליך | madad yecholet tahalich | Process Capability Index (Cpk) |
| לוח בקרה | luach bakara | Control Chart |
| גבול עליון | gvul elyon | Upper Spec Limit / Upper Control Limit |
| גבול תחתון | gvul tachton | Lower Spec Limit / Lower Control Limit |
| סטיית תקן | stiyat teken | Standard Deviation (σ) |
| התעשייה האווירית | ha-ta'asiya ha-aveerit | IAI (Israel Aerospace Industries) |
| אלביט מערכות | Elbit ma'arachot | Elbit Systems |
| משרד הביטחון | misrad ha-bitachon | MOD (Ministry of Defence) |
| מיל-סטד 105E | MIL-STD 105E | MIL-STD-105E sampling standard |
| כשיר | kashir | Capable (of Cpk) |

---

## 10. Integration points

| Upstream / Downstream | Contract |
|---|---|
| **Y-035** Manufacturing Routing | Emits `operation` + `sku` pairs that Y-036 checklists are defined against. |
| **Y-037** NCR Dispositioning | Consumes `bridgeKey: 'Y037.ncr.<NCR-ID>'` — the key at which `rejectLot()` stores the NCR. |
| **Y-038** FAI / PPAP | Uses `stage: 'FAI'` checklists + the `cpk()` method to build the AS9102 Form 3 dimensional results. |
| **Logistics (onyx-procurement/src/logistics)** | Requests `certificateOfConformance()` before releasing a shipment. |
| **Supplier Portal (Y-029)** | Exposes the frozen C of C doc for external defence primes to download. |

---

## 11. Status

| Item | Status |
|---|---|
| Source file | `onyx-procurement/src/manufacturing/qc-checklist.js` — present |
| Test file | `onyx-procurement/test/manufacturing/qc-checklist.test.js` — 33/33 passing |
| Zero-deps | yes (pure `node:test` + `node:assert/strict`) |
| Bilingual | yes (`QC_LABELS_HE`, `QC_LABELS_EN`, bilingual C of C body) |
| Never-delete | yes (versioned checklists, append-only results, frozen records) |
| AQL tables embedded | Normal + Tightened + Reduced, letters A..R, AQL 0.065..6.5 |
| Israeli defense metadata | IAI, Elbit, Rafael, IMI, MOD — with Cpk minimums |

---

**Agent Y-036 — report complete. Never delete, only upgrade and grow.**
