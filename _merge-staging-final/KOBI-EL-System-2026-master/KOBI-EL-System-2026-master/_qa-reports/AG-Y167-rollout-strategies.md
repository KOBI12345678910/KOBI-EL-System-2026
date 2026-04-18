# AG-Y167 — Deployment Rollout Strategy Engine
## דוח QA דו-לשוני / Bilingual QA Report

**Agent:** Y-167
**System:** Techno-Kol Uzi mega-ERP / onyx-procurement
**Module:** `src/devops/rollout-strategies.js`
**Tests:** `test/devops/rollout-strategies.test.js`
**Date / תאריך:** 2026-04-11
**Status / סטטוס:** PASS (24/24 tests green)

---

## 1. Scope / היקף

### English
Build a zero-dependency deployment rollout engine for the Techno-Kol Uzi
ERP stack. Must support four strategies (blue/green, canary 5/25/50/100,
rolling, recreate), with pause points, health-check gates, automatic
rollback on error-rate / latency / CPU breach, audit trail, progress
events, and bilingual progress reporting. Built-ins only; never delete
data.

### עברית
לבנות מנוע פריסה (rollout) לערימת ה-ERP של טכנו-קול עוזי ללא תלויות
חיצוניות. תומך בארבע אסטרטגיות (כחול/ירוק, קנרית 5/25/50/100, מתגלגלת,
Recreate), עם נקודות השהייה, שערי בדיקות בריאות, חזרה אוטומטית לאחור
כאשר מופרים סף שגיאות / השהיה / מעבד, מסלול ביקורת, אירועי התקדמות,
ודיווח התקדמות דו-לשוני. מודולי Node בלבד; אסור למחוק נתונים.

---

## 2. Files Delivered / קבצים שהוגשו

| # | Path | Lines | Purpose / מטרה |
|---|------|-------|----------------|
| 1 | `onyx-procurement/src/devops/rollout-strategies.js` | ~560 | Engine, planner, executor, bilingual labels |
| 2 | `onyx-procurement/test/devops/rollout-strategies.test.js` | ~350 | 24 unit tests, deterministic via injected clock/sleep |
| 3 | `_qa-reports/AG-Y167-rollout-strategies.md` | this file | Bilingual QA report |

---

## 3. Architecture / ארכיטקטורה

```
          targets[] + strategy
                   │
                   ▼
        ┌─────────────────────┐
        │   RolloutStrategy   │  plan(strategy, targets, opts)
        │     (planner)       │  → frozen plan object
        └─────────────────────┘
                   │
                   ▼
        ┌─────────────────────┐
        │     executor        │  execute(plan, adapter)
        │  event emitter +    │  drives steps via adapter
        │    audit trail      │  evaluates gates, rolls back
        └─────────────────────┘
                   │
                   ▼
        ┌─────────────────────┐
        │  InfraAdapter (DI)  │  deploy / provision / shiftTraffic
        │    (mockable)       │  healthCheck / stop / start /
        │                     │  promote / teardownOld / rollback
        └─────────────────────┘
```

### Key design choices / החלטות תכנון מרכזיות

- **Injected I/O** — `sleep`, `now`, `idGen` injectable → fully
  deterministic tests, zero real sleeps.
- **Frozen plans** — `plan()` returns `Object.freeze`d plan + frozen
  step list. Prevents accidental mutation between plan and execute.
- **Null-safe adapter** — missing adapter methods become `{skipped: true}`,
  so the engine runs fine with an empty `{}` adapter during smoke tests.
- **Bilingual labels** — every strategy and every step kind carries
  `{en, he}` labels, emitted on progress events and QA reports.
- **Never delete rule** — teardownOld carries `preserveData: true`;
  `clearAuditTrail()` returns the archived slice instead of dropping it.

---

## 4. Strategy Coverage / כיסוי אסטרטגיות

### 4.1 Blue/Green — כחול/ירוק

Steps emitted:
1. `provision (green)` — הקמת מחסנית ירוקה
2. `deploy (green)` — פריסה לקבוצה
3. `health-check (green)` — בדיקת בריאות
4. `bake (green)` — זמן אפייה
5. `pause` — השהייה
6. `shift-traffic 100% → green` — הסטת תעבורה
7. `health-check (green)` — בדיקת בריאות סופית
8. `promote (green)` — קידום גרסה
9. `teardown-old (blue, preserveData)` — הוצאת מחסנית כחולה משירות

### 4.2 Canary — קנרית 5/25/50/100

For each wave percentage p ∈ {5, 25, 50, 100}:
- `shift-traffic p%`
- `health-check` (with gates)
- `bake` (bakeTimeMs soak)
- `pause` (if not the last wave)

Then: `promote` + `teardown-old (stable, preserveData)`.

### 4.3 Rolling — מתגלגלת

`batchSize` override (default = `ceil(targets/4)`). For each batch:
`deploy → health → bake → pause`. Final step: `promote (rolling)`.

### 4.4 Recreate — פריסה מחדש

`stop (preserveData) → deploy → start → health → bake → promote`. Only
strategy that accepts downtime; still never deletes underlying state.

---

## 5. Health Gates / שערי בריאות

| Metric / מדד | Default / ברירת-מחדל | Field |
|--------------|----------------------|-------|
| Error rate / אחוז שגיאות | 2% | `errorRate` |
| p95 latency / השהיה | 800 ms | `latencyP95Ms` |
| CPU / מעבד | 85% | `cpu` |

Gates are evaluated via `_evaluateGates()`. Any metric exceeding its
threshold throws `HealthGateBreach` (code `HEALTH_GATE_BREACH`) with a
bilingual message. Gates can be overridden per plan via
`overrides.gates`.

---

## 6. Test Results / תוצאות בדיקות

**Command:** `node --test onyx-procurement/test/devops/rollout-strategies.test.js`

```
ℹ tests 24
ℹ pass  24
ℹ fail  0
ℹ duration_ms 168
```

### Test inventory / רשימת הבדיקות

| # | Test / בדיקה | Result |
|---|--------------|--------|
| 1 | blue-green plan structure | PASS |
| 2 | canary 5/25/50/100 waves | PASS |
| 3 | rolling default batchSize | PASS |
| 4 | rolling explicit batchSize | PASS |
| 5 | recreate step order | PASS |
| 6 | plan() input validation | PASS |
| 7 | blue-green execute → promoted, teardown preserves data | PASS |
| 8 | canary per-wave health + bake calls | PASS |
| 9 | rollback on errorRate breach (bilingual error) | PASS |
| 10 | rollback on latency breach | PASS |
| 11 | rollback on CPU breach | PASS |
| 12 | health-check retry recovery | PASS |
| 13 | bakeTime + pauseBetweenSteps honored | PASS |
| 14 | progress events bilingual (he + en) | PASS |
| 15 | audit trail lifecycle + archive-not-delete | PASS |
| 16 | describePlan bilingual output | PASS |
| 17 | progressReport bilingual percent | PASS |
| 18 | per-plan gate override | PASS |
| 19 | empty adapter → steps skipped gracefully | PASS |
| 20 | buildNullAdapter smoke test | PASS |
| 21 | rollback failure keeps plan FAILED | PASS |
| 22 | HealthGateBreach bilingual context | PASS |
| 23 | step ids monotonic + planId prefix | PASS |
| 24 | LABELS include Hebrew glyphs everywhere | PASS |

24 tests, all green. 15+ requirement satisfied with margin.

---

## 7. Compliance / עמידה בכללים

| Rule / כלל | Status | Evidence / הוכחה |
|------------|--------|------------------|
| Never delete / לא למחוק | PASS | `teardownOld` carries `preserveData:true`; `clearAuditTrail()` returns archived slice instead of dropping |
| Built-ins only / מודולי Node בלבד | PASS | Uses `node:events` + `node:crypto` only; no `require` of third-party packages |
| Bilingual / דו-לשוני | PASS | `LABELS` map every strategy/step kind to `{en, he}`; progress events carry `bilingual` payload; `describePlan` + `progressReport` support `locale: 'he'|'en'|'both'` |
| 15+ tests / 15+ בדיקות | PASS (24) | see inventory above |
| Mockable adapter / מתאם הדיד | PASS | all side effects routed through `adapter.<method>`; `buildNullAdapter()` provided |
| Auto promotion + rollback | PASS | `autoPromote` default true; `autoRollback` default true; rollback triggered on gate breach |
| Progress events + audit | PASS | `step:start`, `step:done`, `step:error`, `rollout:start`, `rollout:end`, `rollout:promoted`, `rollout:rollback`, `progress`; `getAuditTrail()` returns full lifecycle |

---

## 8. Observability / ניטור

### Events emitted / אירועים נפלטים

| Event | When / מתי |
|-------|-----------|
| `rollout:start` | executor begins |
| `step:start` | before each step runs |
| `step:done` | after step resolves |
| `step:error` | after step rejects |
| `progress` | traffic shifts, bakes, pauses, health-retries |
| `rollout:rollback` | rollback triggered |
| `rollout:promoted` | auto-promotion succeeded |
| `rollout:paused` / `rollout:resumed` | external pause/resume |
| `rollout:end` | terminal state reached |

### Audit trail schema / סכמת מסלול ביקורת

```json
{
  "at": 1712831234567,
  "event": "step:done",
  "data": {
    "stepId": "t1-s4",
    "kind": "bake",
    "startedAt": 1712831234560,
    "result": { "bakedMs": 10000, "metrics": { "errorRate": 0 } },
    "status": "ok"
  }
}
```

---

## 9. How to Wire / איך לחבר

### English
```js
const { RolloutStrategy, buildNullAdapter } = require('./src/devops/rollout-strategies');

const engine = new RolloutStrategy({ locale: 'both' });

engine.on('progress', (plan, evt) => console.log(evt.bilingual.he));
engine.on('rollout:rollback', (plan, state, ctx) => alert(ctx.bilingual.he));

const plan = engine.plan('canary', [
  { id: 'api-1' }, { id: 'api-2' }, { id: 'api-3' }, { id: 'api-4' },
]);

const summary = await engine.execute(plan, buildNullAdapter());
console.log(engine.describePlan(plan, 'both'));
console.log(engine.progressReport(plan, summary, 'both'));
```

### עברית
יוצרים מופע של `RolloutStrategy`, מאזינים לאירועים (כל אירוע נושא
`bilingual.he` ו-`bilingual.en`), קוראים ל-`plan()` עם אסטרטגיה
ורשימת יעדים, ומריצים עם מתאם תשתיות אמיתי או עם `buildNullAdapter`
לצורך בדיקות עשן. התוצאה היא אובייקט `summary` עם סטטוס סופי,
שלבים שבוצעו, ושגיאה דו-לשונית במקרה של כישלון.

---

## 10. Known Limits / מגבלות ידועות

- **Single-process state** — audit trail + engine state live in memory.
  For multi-instance orchestration, wrap with a shared store keyed by
  `planId`. Same limitation exists in the existing circuit-breaker
  module in `src/resilience/`.
- **Adapter contract is soft** — missing methods are skipped. A real
  production adapter should supply all methods; a later agent can add
  an `assertAdapterContract()` helper if strictness is needed.
- **No built-in metrics-source** — engine relies on the adapter to
  return `{errorRate, latencyP95Ms, cpu}`. Wiring to Prometheus /
  `src/ops/metrics.js` is out of scope for Y-167 and can be added by a
  downstream agent.

---

## 11. Sign-off / אישור

- Code: `src/devops/rollout-strategies.js` — 0 deps, all built-ins.
- Tests: 24/24 green, deterministic (<200ms).
- Bilingual: every label, error, and report covers both he + en.
- Compliance: never-delete, built-ins-only, bilingual-everywhere all
  honored.

**Agent Y-167 — DONE.**
**סוכן Y-167 — הושלם.**
