# AG-Y024 — Opportunity Stage Manager

**Agent:** Y-024 — Swarm Sales
**System:** Techno-Kol Uzi Mega-ERP (Israeli) — Wave 2026
**Module:** `onyx-procurement/src/sales/opportunity-stages.js`
**Test:** `onyx-procurement/test/sales/opportunity-stages.test.js`
**Date:** 2026-04-11
**Rule:** לא מוחקים רק משדרגים ומגדלים — never delete, only upgrade & grow.

---

## 1. Purpose — מטרה

A configurable sales-opportunity pipeline with per-stage **exit
criteria** (criteria that must be satisfied before an opportunity
can leave a stage going forward), stuck-deal detection,
stage-to-stage conversion analytics, weighted pipeline value, and
average-days-to-close velocity.

Designed for the Techno-Kol Uzi construction/procurement domain
where a deal typically flows: Qualification → Discovery →
Proposal → Negotiation → Closed-Won / Closed-Lost.

Characteristics:

- **Zero dependencies.** Node built-ins only.
- **Bilingual.** Every stage carries `name_he` and `name_en`
  labels; every default criterion ships with bilingual labels too.
- **Deterministic.** All timestamps flow through an injectable
  `now()` clock so tests can pin time.
- **Append-only.** Stage transitions, pipelines and opportunity
  history are never deleted. Pipeline upgrades bump `version`
  and keep the previous definition in `getPipelineHistory(id)`.
- **In-memory.** Swappable with persistent storage later; the
  public API was designed to be storage-agnostic.

---

## 2. Public API — ממשק ציבורי

```js
const { OpportunityPipeline } = require('./src/sales/opportunity-stages.js');

const mgr = new OpportunityPipeline();        // default clock = Date.now
mgr.definePipeline({ id, name_he, name_en, stages: [...] });
mgr.upsertOpportunity({ id, amount, contact: {...}, ... });
mgr.moveToStage(oppId, stageId, { reason, force });
mgr.autoProgress(oppId);
mgr.computeWeightedValue(opp);                 // amount × stage probability
mgr.stageDuration(oppId, stageId);             // ms in stage
mgr.stuckOpportunities(thresholdDays);         // or per-stage map
mgr.conversionRate(fromStageId, toStageId, { from, to, pipelineId });
mgr.velocity(pipelineId, { from, to, includeLost });
```

Additional accessors:

| Method | Returns |
|---|---|
| `getPipeline(id)` | Current (latest-version) pipeline |
| `getPipelineHistory(id)` | All versions ever defined |
| `listPipelines()` | All pipelines |
| `getOpportunity(id)` | One opportunity |
| `listOpportunities(filter?)` | Filterable list |
| `evaluateExitCriteria(opp, stageId?)` | Detailed criteria eval |

---

## 3. Default Pipeline — צנרת ברירת מחדל

Seeded automatically on construction (pass `{ seedDefault: false }`
to skip it).

| Order | ID | Hebrew | English | Probability | Terminal |
|:---:|---|---|---|:---:|:---:|
| 0 | `qualification` | הכשרת ליד         | Qualification | 10% | — |
| 1 | `discovery`     | איפיון צרכים      | Discovery     | 25% | — |
| 2 | `proposal`      | הצעת מחיר         | Proposal      | 50% | — |
| 3 | `negotiation`   | משא ומתן          | Negotiation   | 75% | — |
| 4 | `closed_won`    | נסגר בזכייה       | Closed-Won    | 100% | won |
| 5 | `closed_lost`   | נסגר בהפסד        | Closed-Lost   | 0% | lost |

### 3.1 Default exit criteria

#### Qualification → Discovery
| Field | Op | Required | Label (HE) |
|---|---|:---:|---|
| `contact.name`      | truthy | ✓ | שם איש קשר |
| `contact.email`     | truthy | ✓ | דוא"ל איש קשר |
| `budget_confirmed`  | truthy | ✗ | תקציב אושר (advisory) |

#### Discovery → Proposal
| Field | Op | Required | Label (HE) |
|---|---|:---:|---|
| `amount`                    | gt > 0 | ✓ | סכום הזדמנות |
| `needs_summary`             | truthy | ✓ | סיכום צרכים |
| `decision_maker_identified` | truthy | ✓ | מקבל החלטות זוהה |

#### Proposal → Negotiation
| Field | Op | Required | Label (HE) |
|---|---|:---:|---|
| `proposal_sent_at`  | exists  | ✓ | הצעה נשלחה |
| `proposal_version`  | gte ≥ 1 | ✓ | גרסת הצעה |

#### Negotiation → Closed-Won
| Field | Op | Required | Label (HE) |
|---|---|:---:|---|
| `legal_review_status` | in ∈ { approved, waived } | ✓ | סקירה משפטית |
| `final_terms_agreed`  | truthy                    | ✓ | תנאים סופיים סוכמו |

Closed-Won and Closed-Lost are **terminal**: no exit criteria,
`autoProgress` is a no-op, and velocity metrics reach them as
end-states.

---

## 4. Exit-Criteria Syntax — תחביר קריטריונים

Each criterion is a plain object:

```js
{
  field:    'dot.path.into.opportunity',
  op:       'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' |
            'in' | 'nin' |
            'exists' | 'nexists' | 'truthy' | 'falsy' |
            'contains' | 'startsWith' | 'endsWith' |
            'between' | 'regex',
  value:    /* depends on op */,
  required: true | false,                  // default true
  label_he: 'תווית בעברית (אופציונלי)',
  label_en: 'English label (optional)',
}
```

### Operator reference

| Op | Actual type | Value | Notes |
|---|---|---|---|
| `eq` / `ne` | any | any | Strict `===` |
| `gt` / `gte` / `lt` / `lte` | number | number | Non-numbers fail |
| `in` / `nin` | any | array | Membership |
| `exists` / `nexists` | any | ignored | `undefined` / `null` |
| `truthy` / `falsy` | any | ignored | JS truthiness |
| `contains` | string or array | value | substring or element |
| `startsWith` / `endsWith` | string | string | — |
| `between` | number | `[min, max]` | inclusive on both ends |
| `regex` | string | RegExp or string | unsafe patterns fail closed |

**Unknown operators fail closed** — an invalid op is treated as a
failed criterion, never as a pass, so upstream validation errors
cannot accidentally let a deal skip a gate.

### Required vs. optional

- `required: true` (default) — blocks forward transitions when
  unmet. Reported in `evaluateExitCriteria().unmet`.
- `required: false` — **advisory** only. Reported in
  `.optional[]` but does NOT block `moveToStage` or `autoProgress`.
  Use advisory criteria for "nice to have" checks (e.g. tags,
  enrichment fields) you want surfaced in the UI without making
  them hard gates.

---

## 5. Stage Transitions — מעברים בין שלבים

### moveToStage rules

1. **Forward moves** (target stage has higher `order` than current)
   must pass `evaluateExitCriteria(opp, currentStage)`. If any
   `required` criterion is unmet, `moveToStage` throws with:
   ```
   Error: exit criteria unmet for stage "qualification": Contact name present, Contact email present
     .code = 'EXIT_CRITERIA_UNMET'
     .fromStage
     .toStage
     .unmet[]
   ```
2. **Rollbacks** (same or lower `order`) are **always allowed**
   and recorded in `stage_history` with `reason: 'rollback'`.
3. **Force override**: `moveToStage(id, target, { force: true })`
   bypasses criteria. The transition is still recorded and an
   explicit `reason` is recommended for audit trails.
4. Target must exist in the opportunity's pipeline, otherwise
   `Error: stage not in pipeline: …`.
5. Moving to the current stage is a no-op (history unchanged).

### autoProgress

Evaluates exit criteria of the current stage; if all required
criteria are met and the stage is not terminal, advances the
opportunity to the **next non-lost** stage in `order` and returns
the updated opportunity. Otherwise returns the opportunity
unchanged — safe to call idempotently.

### Append-only history

Every transition appends a new entry to `stage_history` and closes
the previous entry's `exitedAt`. `upsertOpportunity` cannot shrink
history and cannot change `pipelineId` or `stageId` on an existing
record — those flow only through `moveToStage`.

---

## 6. Stuck Detection — גילוי עסקאות תקועות

### Rules

1. Only **non-terminal** stages count. Closed-Won and Closed-Lost
   never show up as stuck.
2. Time-in-stage is the **sum of all visits** to that stage (so a
   deal that bounced discovery → qualification → discovery has
   the combined duration counted).
3. Threshold resolution:
   - `stuckOpportunities(30)` → 30-day default for every stage.
   - `stuckOpportunities({ default: 30, proposal: 7, negotiation: 14 })`
     → per-stage override, with `default` applied to stages not
     explicitly listed.
4. Results are sorted **longest-stuck first** so the UI can
   surface the worst offenders without further work.
5. Output entry shape:
   ```
   {
     opportunity,        // full Opportunity object
     stageId,
     stageName_he,
     stageName_en,
     days,               // time in current stage, rounded to 2dp
     threshold,          // the threshold that was applied
   }
   ```

Recommended defaults for the construction/procurement domain
(used in the UI; overridable per-tenant):

| Stage | Days until "stuck" |
|---|:---:|
| Qualification | 14 |
| Discovery     | 21 |
| Proposal      |  7 |
| Negotiation   | 14 |

---

## 7. Analytics — אנליטיקה

### computeWeightedValue

```
weighted = amount × stage.probability
```

- Closed-Won returns `amount` (probability 1.00).
- Closed-Lost returns `0` (probability 0.00).
- Rounded to 2 decimal places (half-up).

### conversionRate(fromStage, toStage, period?)

Denominator = opportunities that **entered** `fromStage` inside
the period window. Numerator = those that **later entered**
`toStage`. `rate` is the ratio rounded to 4 decimals.

Period window filter applies to the `fromStage` entry timestamp,
so it answers: *"of the deals that reached X between Jan and Mar,
what fraction eventually reached Y?"*

### velocity(pipelineId, period?)

Reports the average days-to-close for opportunities in a given
pipeline. Only **terminal** opportunities (won by default, or
also lost if `includeLost: true`) count, and only if their
terminal timestamp falls inside the period window.

Response:

```js
{
  pipelineId,
  samples,       // number of closed deals counted
  avgDays,       // mean days from created_at → close
  medianDays,    // p50
  minDays, maxDays,
  wonCount, lostCount,
}
```

---

## 8. Append-Only Enforcement

| Surface | Protection |
|---|---|
| `definePipeline` | A second call with the same id creates a new version; prior versions remain retrievable via `getPipelineHistory`. |
| `upsertOpportunity` | `pipelineId`, `stageId`, `stage_history`, `stage_entered_at`, `created_at` are protected: a patch cannot rewrite them. Arbitrary business fields ARE writable (that's the point). |
| `moveToStage` | Appends to `stage_history`; closes the prior entry's `exitedAt` but never mutates older entries. |
| `getPipelineHistory(id)` | Returns a fresh copy of the internal history array so callers cannot mutate it. |

---

## 9. Hebrew Glossary — מילון עברי

| English | Hebrew | Notes |
|---|---|---|
| Opportunity | הזדמנות | A deal / prospect |
| Pipeline | צנרת מכירות | Full funnel |
| Stage | שלב | One step in the funnel |
| Exit criteria | קריטריוני יציאה | Gating conditions |
| Required | חובה | Blocks transition |
| Optional / advisory | רשות / המלצה | Reported only |
| Move / transition | מעבר שלב | — |
| Rollback | החזרה אחורה | Moving back a stage |
| Auto-progress | קידום אוטומטי | Advance when criteria met |
| Weighted value | ערך משוקלל | amount × probability |
| Stuck | תקוע | Too long in a stage |
| Stage duration | זמן בשלב | ms since entered |
| Conversion rate | אחוז המרה | Stage→stage ratio |
| Velocity | מהירות צנרת | Avg days to close |
| Qualification | הכשרת ליד | First stage |
| Discovery | איפיון צרכים | Needs analysis |
| Proposal | הצעת מחיר | Quote / offer |
| Negotiation | משא ומתן | Commercial terms |
| Closed-Won | נסגר בזכייה | Deal won |
| Closed-Lost | נסגר בהפסד | Deal lost |
| Decision maker | מקבל החלטות | Authority to sign |
| Legal review | סקירה משפטית | Counsel approval |
| Final terms agreed | תנאים סופיים סוכמו | Handshake |

---

## 10. Test Coverage — כיסוי בדיקות

File: `onyx-procurement/test/sales/opportunity-stages.test.js`
Runner: `node --test`
**Result: 42/42 passing** as of 2026-04-11.

Scenarios exercised:

- **Default pipeline seed** — id, stage count, probabilities,
  terminal flags, bilingual labels, frozen spec.
- **definePipeline validation** — empty stages rejected,
  duplicate ids rejected, out-of-range probability rejected,
  version bump + history retention on upgrade.
- **Exit criteria operators** — eq/ne/gt/gte/lt/lte/in/nin,
  truthy/exists/between/regex/contains, optional vs. required,
  unknown op fails closed.
- **moveToStage enforcement** — forward blocked on unmet,
  forward allowed on met, `force` override, backward rollback
  always allowed, unknown stage throws, same-stage no-op.
- **autoProgress** — single advance, chained advance through
  the full funnel up to Closed-Won, terminal no-op.
- **computeWeightedValue** — amount × probability, won / lost
  edge cases, 2-dp rounding.
- **stageDuration** — current stage, summed multi-visit after
  rollback.
- **stuckOpportunities** — default threshold, per-stage map
  override, terminal stages never stuck, sort order.
- **conversionRate** — basic rate, period-window filter, zero
  denominator.
- **velocity** — avg/median/min/max, lost exclusion by default,
  `includeLost` override, zero samples, unknown pipeline.
- **Append-only** — history never shrinks on upsert, pipelineId
  cannot be reassigned.
- **Internal helpers** — `getPath`, `checkCriterion`, `toMs`.

---

## 11. Integration Notes — אינטגרציה

- The module is intentionally storage-agnostic. Wire a
  persistent store by wrapping `upsertOpportunity` and loading
  opportunities into the instance on boot; the public API shape
  will not change.
- For multi-tenant deployments, instantiate one
  `OpportunityPipeline` per tenant (the in-memory Map is not
  shared).
- The clock injection (`new OpportunityPipeline({ now: () => … })`)
  makes it trivial to build demo mode and reproducible seeds.
- Forecast dashboards should reuse `computeWeightedValue` over
  `listOpportunities({ open: true })` to get the "weighted open
  pipeline" number.

---

**End of report. Never delete, only upgrade and grow.**
לא מוחקים רק משדרגים ומגדלים.
