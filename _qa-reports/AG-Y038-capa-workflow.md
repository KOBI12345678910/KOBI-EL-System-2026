# AG-Y038 — CAPA Workflow (Corrective & Preventive Action, 8D)

**Agent:** Y-038 — Swarm Quality
**System:** Techno-Kol Uzi Mega-ERP (Israeli) — Wave 2026
**Module:** `onyx-procurement/src/quality/capa-workflow.js`
**Test:** `onyx-procurement/test/quality/capa-workflow.test.js`
**Date:** 2026-04-11
**Status:** GREEN — **60 / 60 tests passing**
**Rule:** לא מוחקים רק משדרגים ומגדלים — never delete, only upgrade & grow.
**Upstream integration:** Y-037 NCR (Nonconformance Report).

---

## 1. Purpose — מטרת המודול

The **CAPA** (Corrective and Preventive Action) workflow is the closed-loop
quality-improvement engine required by **ISO 9001:2015 clause 10.2**. It
turns detected problems (nonconformances, audit findings, customer
complaints, internal observations) into **structured 8D investigations**
with enforced stage gates, evidence capture, effectiveness verification,
and automated escalation.

For Techno-Kol Uzi — a metal-fabrication shop — CAPA is the mechanism
that drives measurable reductions in weld defects, cold-joint recurrence,
coating failures, and supplier-side metal-certificate gaps. The module
integrates directly with the Y-037 NCR system as its most common trigger.

CAPA is **not** a ticketing system. A CAPA commits the company to:

1. Define the problem (D2)
2. Stop the bleeding (D3 Containment)
3. Find out *why* (D4 Root Cause)
4. Fix it *permanently* (D5–D6)
5. Prevent the same class of issue from recurring (D7)
6. Verify the fix actually worked (D8 + Effectiveness Check)

---

## 2. 8D Methodology — שמונת השלבים (Ford, 1987)

The module implements the full Ford 8D (Eight Disciplines) problem-solving
methodology, which is the de-facto industry standard for manufacturing
corrective action. ISO 9001 is tool-agnostic; 8D is the standard tool.

| # | Stage | Hebrew | Purpose |
|:-:|---|---|---|
| **D1** | **Team** | הקמת צוות | Assemble cross-functional owners |
| **D2** | **Problem** | הגדרת הבעיה | Describe the nonconformance precisely (what/where/when/how-many) |
| **D3** | **Containment** | פעולה מכילה | Protect the customer **now** — quarantine, 100% inspection |
| **D4** | **Root Cause** | שורש הבעיה | 5-Why / Fishbone / Pareto — find the real cause, not a symptom |
| **D5** | **Permanent Action** | פעולה קבועה | Design the corrective change (process, parameter, gauge, training) |
| **D6** | **Implement** | יישום | Deploy the permanent fix — must be timestamped |
| **D7** | **Prevent** | מניעת חזרה | Update FMEAs, control plans, audits, training so the same *class* of issue cannot recur |
| **D8** | **Close** | סגירה | Quality manager approves closure; start the effectiveness clock |

Each stage has a **service-level agreement (SLA)** in days, measured from
CAPA creation, and adjusted by severity:

| Stage | SLA (days) | Critical (×0.5) | Major (×0.75) | Minor (×1.0) | Observe (×1.5) |
|---|:-:|:-:|:-:|:-:|:-:|
| D1 Team         |   1 | 1 | 1 | 1 | 2 |
| D2 Problem      |   3 | 2 | 2 | 3 | 5 |
| D3 Containment  |   5 | 3 | 4 | 5 | 8 |
| D4 Root Cause   |  14 | 7 | 11 | 14 | 21 |
| D5 Permanent    |  21 | 11 | 16 | 21 | 32 |
| D6 Implement    |  45 | 23 | 34 | 45 | 68 |
| D7 Prevent      |  60 | 30 | 45 | 60 | 90 |
| D8 Close        |  90 | 45 | 68 | 90 | 135 |

The severity multiplier table is exported as `SEVERITY_SLA_MULTIPLIER`
so host systems can read it or override it.

---

## 3. Stage Gates — Enforced Rules

The `advanceStage(capaId, stage, evidence)` method is the single
progression gate. It enforces:

| Rule | Enforcement |
|---|---|
| **No stage skipping** | `targetIdx === currentIdx + 1` required, else throws |
| **No backward motion** | `targetIdx > currentIdx` required |
| **No edits after closure** | CLOSED or ARCHIVED CAPAs throw on advance |
| **Evidence required** | `evidence` object with `notes` or `attachments` |
| **D3 (Containment)** | Requires `evidence.containmentAction` (bleed-stop) |
| **D4 (Root Cause)** | Requires `evidence.rootCause` (narrative or structured) |
| **D6 (Implement)** | Requires `evidence.implementedAt` timestamp |
| **D8 (Close)** | Requires `evidence.approvedBy` (QM signature) |
| **Effectiveness first** | D8 → `VERIFYING` status; `CLOSED` only after a **passing** effectiveness check |

This is the ISO 9001 §10.2.2 audit trail in code: every stage transition
leaves a record with stage name, timestamp, actor, and the evidence
object that was relied upon.

Tests covering these gates: **15 – 26** in the test file.

---

## 4. Effectiveness Check — §10.2.1(f)

ISO 9001:2015 explicitly requires that the organization **"review the
effectiveness of any corrective action taken"**. The `effectivenessCheck`
method codifies this:

```js
wf.effectivenessCheck(capaId, {
  daysAfter: 45,                 // days since D6 implementation
  metric:    'defect_rate_pct',  // measurement name
  result: {
    baseline: 4.8,               // pre-CAPA metric
    current:  0.3,               // post-CAPA metric
    target:   1.0,               // acceptance bar
    higherIsBetter: false,       // default: lower-is-better
  },
});
```

| Guard | Behavior |
|---|---|
| `daysAfter < 30` | Throws — minimum 30-day observation window (`MIN_EFFECTIVENESS_WAIT_DAYS`) |
| Before D6 (Implement) | Throws — you cannot verify something you haven't deployed |
| `result.passed` unset | Auto-computed via `current vs target` using `higherIsBetter` flag |
| PASS | `closureOutcome = 'EFFECTIVE'`, closes CAPA if D8 reached |
| FAIL | `closureOutcome = 'INEFFECTIVE'`, status reverts to `IN_PROGRESS` for a fresh root-cause pass |

Tests: **27 – 32**.

---

## 5. Escalation Ladder — Aged-CAPA Safety Net

Aged CAPAs automatically escalate up three levels based on days-past-SLA
of the **current** stage (not the final deadline):

| Level | Threshold | Target role | Notification |
|:-:|:-:|---|---|
| **1** | > 3 days over SLA  | Supervisor                | Email to owner + supervisor |
| **2** | > 7 days over SLA  | Department manager        | Email + dashboard flag      |
| **3** | > 14 days over SLA | Executive / QM            | Weekly exec review item     |

The `escalation(capaId)` method is **idempotent and monotonic**: it will
only ever raise the level, never lower it. Calling it on a closed/archived
CAPA returns `level: 0, reason: 'not-active'` without side-effects.

Every level change appends a record to `capa.escalationHistory`, so the
ladder is fully auditable.

Tests: **33 – 39**.

---

## 6. Recurrence Detection — relatedCAPAs

`relatedCAPAs(capaId)` implements the systemic-issue detector required
by the "Prevent" discipline (D7). It scores every other CAPA against the
seed using four signals:

| Signal | Weight | Rationale |
|---|:-:|---|
| Same `sourceId` (same NCR) | +0.9 | Definitive link |
| Same product (via NCR snapshot) | +0.4 | Product-level recurrence |
| Same supplier (via NCR snapshot) | +0.3 | Supplier-level recurrence |
| Jaccard text similarity ≥ 0.35 | +sim | Semantic match on descriptions |
| Confirmed-root-cause similarity ≥ 0.4 | +sim×0.8 | Same failure mode |
| Same trigger type | +0.05 | Weak global signal |

Matches with total score ≥ 0.35 are returned, sorted descending. The
`metrics.recurrenceRate` KPI uses the `sourceId` signal alone for a
clean, auditable definition: `# sources that appeared in >1 CAPA / #
unique sources`.

Tests: **40 – 44**, **53**.

---

## 7. Bilingual 8D Report — generate8DReport

```js
const report = wf.generate8DReport(capaId);
```

Returns a frozen, fully-serializable content model — no PDF rendering,
no file I/O. The caller wires it into their preferred renderer (the
existing `pdf-generator.js` module, a web UI, XML export, etc.).

Shape:

```
report.meta
  ├── capaId, preparedAt, createdAt, closedAt, dueDate
  ├── title              { he, en }   — bilingual title
  ├── trigger            { code, he, en }
  ├── severity           { code, he, en }
  ├── isoReference       { code: '10.2', he, en }
  ├── sourceId           — NCR id when trigger === 'ncr'
  └── ncrSnapshot        — { ncrId, product, supplier, severity, loggedAt }
report.problem           { he, en }
report.rootCause         { he, en }
report.containment       — containment narrative
report.permanentAction   — D5 narrative
report.preventiveAction  — D7 narrative
report.sections[8]       — one entry per D-stage:
  { stage, labelHe, labelEn, enteredAt, completedAt, dueAt,
    evidence, state: 'PENDING'|'IN_PROGRESS'|'COMPLETED' }
report.effectivenessChecks[] — every check ever performed
report.escalationHistory[]    — full escalation ladder
report.labels            { he: LABELS_HE, en: LABELS_EN } — for UI
```

Tests: **49 – 51**.

---

## 8. Dashboards & Metrics

### openCAPAs(owner?)
Returns all non-closed, non-archived CAPAs as frozen dashboard views,
sorted by `dueDate`. Optional `owner` filter uses an index for O(k)
lookup instead of O(n) scan.

### overdueCAPAs()
Returns CAPAs whose **current-stage** SLA has lapsed (not just the
final D8 deadline). Each entry includes `overdueDays` and `overdueStage`.

### metrics(period)
Aggregates KPIs for a creation-date window:

| KPI | Formula |
|---|---|
| `total` | Count of CAPAs created in window |
| `open` / `closed` / `escalated` / `ineffective` | Status counts |
| `avgTimeToContainmentDays` | mean( `containmentAt − createdAt` ) over CAPAs that reached D3 |
| `avgTimeToResolutionDays`  | mean( `closedAt − createdAt` ) over CLOSED CAPAs |
| `effectivenessRate`        | `(closed − ineffective) / closed` |
| `recurrenceRate`           | `# sources with >1 CAPA / # unique sources` |
| `byTrigger` / `bySeverity` | Breakdown maps |

`period` accepts `'all'`, `{ from, to }`, or partial windows. All
results are frozen.

Tests: **45 – 48**, **52 – 55**.

---

## 9. Integration with Y-037 (NCR)

The CAPAWorkflow constructor accepts an optional `ncrRepo`:

```js
const wf = new CAPAWorkflow({
  ncrRepo: {
    findNcrById(id) { /* returns NCR or null */ },
  },
});

wf.createCAPA({
  trigger: 'ncr',
  sourceId: 'NCR-000123',
  description_he: 'ריתוך קר במסגרת',
  description_en: 'Cold weld on frame',
  severity: 'MAJOR',
  owner: 'qm@techno-kol-uzi',
});
```

When `trigger === 'ncr'` and a `sourceId` is supplied, the CAPA is
enriched with a frozen `ncrSnapshot` containing `{ ncrId, product,
supplier, severity, loggedAt }`. This enables:

- Cross-CAPA product-level recurrence detection (`relatedCAPAs`)
- Supplier rollups in `metrics`
- Bilingual report headers with the original NCR context

The NCR lookup is **safe-by-default** — any error inside the repo is
swallowed and `ncrSnapshot` becomes `null`, so NCR outages never block
CAPA creation. Tested in test 14.

---

## 10. Non-Destructiveness — לא מוחקים

Per the repository rule, the module **never hard-deletes**:

- `archiveCAPA(id, reason)` sets `status = ARCHIVED`, stamps `archivedAt`
  and `archiveReason`, and leaves the full CAPA in the store.
- Archived CAPAs are **excluded** from `openCAPAs()` and `overdueCAPAs()`
  but **still retrievable** via `getCAPA(id)`.
- `advanceStage` throws on archived CAPAs (immutable after archive).
- `_reset()` exists as a **test helper only** (prefix underscore,
  documented), never called from production paths.
- No Map `.delete()` or Array `.splice()` that discards data on the
  write paths.

Tests: **56 – 59**.

---

## 11. ISO 9001:2015 Cross-Reference Table

| Clause | Requirement | How this module satisfies it |
|---|---|---|
| **8.7** | Control of nonconforming outputs | D3 Containment stage + `containmentAction` requirement |
| **9.1** | Monitoring, measurement, analysis | `metrics(period)` + `effectivenessCheck` metric/baseline |
| **9.2** | Internal audit | `audit` trigger type; audit findings become CAPAs |
| **9.3** | Management review | `metrics` output feeds the management-review deck |
| **10.1** | Improvement | `createCAPA({ trigger: 'internal' })` enables proactive CAPAs |
| **10.2.1** | React, evaluate, implement, review effectiveness | Full 8D walkthrough + `effectivenessCheck` |
| **10.2.2** | Retain documented information | `stageHistory` + frozen `evidence` per stage |
| **10.3** | Continual improvement | `recurrenceRate` + `relatedCAPAs` feed the improvement loop |

All ISO references are exported as `ISO_9001_REFS` so the host UI can
render the citation alongside each CAPA.

---

## 12. Hebrew Glossary — מילון מונחים

| English | Hebrew | Notes |
|---|---|---|
| Corrective action | פעולה מתקנת | Fix the existing problem |
| Preventive action | פעולה מונעת | Prevent a potential problem |
| CAPA | פעולות מתקנות ומונעות | Combined umbrella |
| Nonconformance (NCR) | אי־התאמה | Y-037 upstream |
| Root cause | שורש הבעיה | D4 artifact |
| Containment | פעולה מכילה | D3 artifact — protect the customer |
| Permanent action | פעולה קבועה | D5/D6 artifact |
| Prevention | מניעת חזרה | D7 artifact |
| Effectiveness check | אימות אפקטיביות | ISO 9001 §10.2.1(f) |
| Escalation | הסלמה | Aged-CAPA ladder |
| Severity | חומרה | CRITICAL / MAJOR / MINOR / OBSERVE |
| Quality manager | מנהל איכות | D8 approver role |
| Audit finding | ממצא ביקורת | `trigger: 'audit'` |
| Customer complaint | תלונת לקוח | `trigger: 'customer-complaint'` |
| 8D | שמונת השלבים | Ford Global 8D methodology |
| Time-to-containment | זמן להכלה | KPI: `createdAt → D3 completion` |
| Time-to-resolution | זמן לפתרון | KPI: `createdAt → D8 + effectiveness pass` |
| Recurrence rate | שיעור חזרה | KPI: `# recurring sources / # unique sources` |

---

## 13. Public API Reference

```js
const { CAPAWorkflow, STAGES, TRIGGERS, SEVERITIES, STATUS,
        ISO_9001_REFS, LABELS_HE, LABELS_EN }
  = require('./src/quality/capa-workflow.js');

const wf = new CAPAWorkflow({ now, ncrRepo, idGen });

// Core operations
const capaId = wf.createCAPA({ trigger, description_he, description_en,
                               rootCause, sourceId, severity, owner });
wf.advanceStage(capaId, 'D2', { notes, attachments, approvedBy, ... });
wf.effectivenessCheck(capaId, { daysAfter, metric, result });

// Queries
wf.getCAPA(capaId);
wf.relatedCAPAs(capaId);
wf.openCAPAs(owner?);
wf.overdueCAPAs();
wf.metrics({ from, to });

// Lifecycle
wf.escalation(capaId);
wf.archiveCAPA(capaId, reason);

// Reporting
wf.generate8DReport(capaId);
```

---

## 14. Test Coverage

File: `test/quality/capa-workflow.test.js` — **60 tests, all passing**.

| Suite | # | Focus |
|---|:-:|---|
| Constants & exports | 5 | Class export, STAGES order, ISO refs, frozen labels, SLA multipliers |
| createCAPA | 9 | Inputs, validation, bilingual fallback, NCR integration, safe-by-default |
| 8D stage gating | 12 | Advance, skip-prevention, backward-prevention, evidence rules, all stage-specific requirements, full walkthrough, short-form stage names |
| effectivenessCheck | 6 | Before-D6 guard, 30-day minimum, pass/fail, lower/higher-is-better, auto-close |
| Escalation | 7 | All three levels, history recording, monotonicity, no-op on closed |
| Recurrence | 5 | Same-source, text-similarity, same-product via NCR snapshot, ranking |
| Dashboards | 4 | openCAPAs filter, overdueCAPAs, archive exclusion |
| 8D Report | 3 | Bilingual structure, stage state, NCR snapshot inclusion |
| Metrics | 4 | Totals, recurrence rate, time-to-containment, effectiveness rate |
| Non-destructiveness | 4 | Archive, exclusion from open list, blocked advance, count |
| End-to-end | 1 | Full NCR → 8D → verify → closure |

Run:

```bash
cd onyx-procurement
node --test test/quality/capa-workflow.test.js
```

Result: `tests 60 / pass 60 / fail 0 / duration ~130ms`.

---

## 15. Dependencies & Constraints

- **Zero external dependencies** — only Node built-ins (`Date`, `Map`, `Set`).
- **Zero file I/O** — everything is in-memory; the host ERP wires its
  own persistence adapter via the repo pattern.
- **Deterministic clock** — constructor accepts `options.now: () => Date`
  so tests can advance virtual time without touching the system clock.
- **Custom id generator** — constructor accepts `options.idGen` to
  plug into the host's existing id-minting strategy.
- **Pure data returns** — every method returns frozen shells or plain
  objects; no references to internal maps leak to callers.
- **Bilingual** — Hebrew + English throughout, including error messages
  that cite the module name.

---

## 16. Files

| Path | Role |
|---|---|
| `onyx-procurement/src/quality/capa-workflow.js` | Business logic — `CAPAWorkflow` class + constants. |
| `onyx-procurement/test/quality/capa-workflow.test.js` | Node `--test` suite, 60 tests. |
| `_qa-reports/AG-Y038-capa-workflow.md` | **This report — never delete.** |

---

## 17. Future Upgrades (non-breaking)

Following the *"לא מוחקים רק משדרגים ומגדלים"* rule, the following
enhancements can be added without modifying the current public API:

1. **Pareto charts** — consume `metrics.byTrigger` + `bySeverity` in a
   dashboard widget.
2. **Ishikawa diagrams** — add optional `evidence.fishbone` field to D4;
   the existing tests pin specific keys, not the full evidence shape.
3. **Persistent store adapter** — inject a repo via constructor options;
   the in-memory `_capas` Map can become a thin cache.
4. **Email/SMS notifiers** — pluggable via constructor, same pattern as
   the Y-037 NCR integration.
5. **Cross-ERP linkage** — currently wired to `ncrRepo`; the same pattern
   can be added for `auditRepo`, `complaintRepo`.
6. **Multi-language labels** — `LABELS_*` dictionaries are the extension
   point; add a third language without touching core logic.

**None of these require removing code or breaking tests.**

---

**Status:** GREEN — all 60 tests pass, no open issues.
**ISO 9001:2015 alignment:** clauses 8.7, 9.1, 9.2, 9.3, 10.1, 10.2, 10.3.
**Signed-off:** Agent Y-038 — 2026-04-11.
