# AG-Y179 — Rollback Automation Engine / מנוע אוטומציית החזרות

**Status:** PASS (21/21 tests green)
**Date:** 2026-04-11
**Agent:** Y-179 — Techno-Kol Uzi mega-ERP
**Module:** `onyx-procurement/src/devops/rollback-engine.js`
**Tests:** `onyx-procurement/test/devops/rollback-engine.test.js`
**Rule enforced:** לא מוחקים רק משדרגים ומגדלים (never delete — only upgrade and grow)
**Dependencies:** Node.js built-ins only (`node:test`, `node:assert/strict`)

---

## 1. Purpose / מטרה

**EN:** Automated rollback engine for Techno-Kol Uzi mega-ERP releases. Watches user-registered health metrics (SLO error rate, latency, custom health checks), triggers automatic rollback when a metric breaches a threshold for longer than a configured duration, and guards against runaway rollback loops, freeze-window violations, and destructive data migrations. All rollback execution is delegated to an injected `executor` function so the engine remains transport-agnostic (kubectl, helm, ssh, docker — any side effect lives in caller code).

**HE:** מנוע אוטומציית החזרה עבור מערכת הטכנו-קול עוזי. המנוע עוקב אחר מדדי בריאות הנרשמים ע״י המשתמש (שיעור שגיאות, זמן תגובה, בדיקות בריאות מותאמות), מפעיל החזרה אוטומטית כאשר מדד חוצה סף יותר מ-N שניות, ומגן מפני לולאות החזרה, חלונות הקפאה, ומיגרציות נתונים הרסניות. ביצוע ההחזרה עצמו מופעל דרך פונקציית `executor` המוזרקת מבחוץ — כך שהמנוע אינו תלוי בטכנולוגיית הפריסה.

## 2. Core Capabilities / יכולות עיקריות

| # | Feature / יכולת                     | EN                                              | HE                                                  |
|---|-------------------------------------|-------------------------------------------------|-----------------------------------------------------|
| 1 | Auto triggers                       | SLO breach, error spike, custom health         | הפרת SLO, זינוק שגיאות, בדיקה מותאמת                |
| 2 | Duration gating                     | breach must persist > durationMs               | ההפרה חייבת להחזיק מעמד יותר מ-durationMs           |
| 3 | Freeze windows                      | business-hours / on-call silence               | חלונות הקפאה (שעות עסקים, משמרת שקטה)               |
| 4 | Manual override                     | bypass freeze with operator name logged        | דריסה ידנית עם תיעוד שם המבצע                       |
| 5 | Loop guard                          | pause engine after N rollbacks in M minutes    | השהיית המנוע לאחר N החזרות ב-M דקות                 |
| 6 | Resume                              | human operator lifts pause (never auto-clears) | אופרטור אנושי מסיר את ההשהיה                        |
| 7 | Dependency order                    | topological sort upstream-first                | מיון טופולוגי — שירות הקצה אחרון                    |
| 8 | Cycle detection                     | refuses to roll back a cyclic graph            | סירוב לבצע החזרה כאשר קיים מעגל תלות                |
| 9 | Destructive migration check         | blocks DROP/TRUNCATE/DELETE-all                | חסימה של DROP/TRUNCATE/DELETE ללא WHERE             |
| 10| Custom migration checks             | pluggable, fail-closed                         | בדיקות מותאמות, כשלון סגור                          |
| 11| Bilingual incident summary          | English + Hebrew side by side                  | סיכום אירועים דו-לשוני                              |
| 12| Append-only history                 | never deletes, moves overflow to archive       | היסטוריה בלתי-מחיקה, עודף לארכיון                   |

## 3. Public API / ממשק ציבורי

```js
const { RollbackEngine } = require('./rollback-engine');

const engine = new RollbackEngine({
  executor: async ({ releaseId, reason, order }) => { /* kubectl, helm, ... */ },
  loopGuardCount: 3,
  loopGuardWindowMs: 10 * 60 * 1000,
});

// 1. register auto-triggers
engine.registerTrigger('error-rate',  () => metrics.errorRate(),   0.05, 30_000);
engine.registerTrigger('p99-latency', () => metrics.p99LatencyMs(), 1200, 60_000);

// 2. register dependency graph (upstream-first rollback)
engine.registerDependency('web', ['api']);
engine.registerDependency('api', ['db']);

// 3. freeze during business hours
engine.freeze(Date.now(), Date.now() + 8 * 3600_000, 'business hours');

// 4. on every scheduler tick, watch the current release
const report = engine.watch('release-2026-04-11-01');
if (report.ready) {
  await engine.autoRollback('release-2026-04-11-01', report.readyTrigger, {
    service: 'web',
    migrationPlan: deployment.rollbackSql,
  });
}

// 5. bilingual post-incident summary
console.log(engine.incidentSummary(20));
```

### Method reference / מפרט שיטות

| Method                                 | Purpose (EN)                                | Purpose (HE)                                |
|----------------------------------------|---------------------------------------------|---------------------------------------------|
| `registerTrigger(name, fn, thr, dur)`  | Add an auto-rollback trigger                | הוספת טריגר החזרה אוטומטית                  |
| `registerDependency(svc, upstream[])`  | Add node to dependency graph                | הוספת קשר תלות בגרף                         |
| `registerMigrationCheck(name, fn)`     | Add custom migration-safety check           | הוספת בדיקת מיגרציה מותאמת                  |
| `freeze(start, end, reason)`           | Declare a freeze window                     | הגדרת חלון הקפאה                            |
| `isFrozen(at?)`                        | Is timestamp covered by any freeze window?  | האם הזמן מצוי בחלון הקפאה?                  |
| `watch(releaseId)`                     | Evaluate all triggers, return report        | הערכת כל הטריגרים והחזרת דוח                |
| `autoRollback(rel, reason, opts?)`     | Automatic rollback (subject to guards)      | החזרה אוטומטית (כפופה לשומרים)              |
| `manualRollback(rel, reason, op, opt)` | Operator rollback (bypasses freeze)         | החזרה ידנית (עוקפת הקפאה)                   |
| `loopGuardStatus()`                    | Snapshot of loop-guard counters             | מצב שומר הלולאות                            |
| `pausedByLoopGuard()`                  | Is the engine currently paused?             | האם המנוע מושהה?                            |
| `resume(operator)`                     | Human-lifts loop-guard pause                | הסרת השהיה ע״י אופרטור                      |
| `getDependencyOrder(service)`          | Topological rollback order                  | סדר החזרה טופולוגי                          |
| `checkMigrationSafety(plan)`           | Run built-in + custom migration checks      | הרצת בדיקות מיגרציה                         |
| `incidentSummary(limit?)`              | Bilingual Markdown summary                  | סיכום אירועים דו-לשוני                      |
| `history()`                            | All incidents + archive                     | היסטוריה מלאה + ארכיון                      |

## 4. Safety Guards / שומרי בטיחות

### 4.1 Freeze window / חלון הקפאה

`freeze(startMs, endMs, reason)` declares a closed interval during which `autoRollback` returns an incident with outcome `BLOCKED_FREEZE`. Multiple windows may be active simultaneously — if any covers "now", auto-rollback is blocked. Manual rollback is **not** blocked (operator override) but the name of the human is always recorded on the incident.

`freeze(startMs, endMs, reason)` מגדיר מרווח זמן סגור שבו `autoRollback` מחזיר אירוע עם תוצאה `BLOCKED_FREEZE`. ניתן להגדיר מספר חלונות במקביל. החזרה ידנית אינה חסומה, אך שם המבצע נרשם תמיד באירוע.

### 4.2 Loop guard / שומר לולאות

Configurable via `loopGuardCount` (default 3) and `loopGuardWindowMs` (default 10 minutes). After that many successful rollbacks fall within the sliding window, the engine **pauses** itself — subsequent `autoRollback` calls return `BLOCKED_LOOPGUARD` until a human calls `resume(operator)`. The pause is never auto-cleared: runaway rollback loops require human eyes on the cause.

ניתן להגדרה דרך `loopGuardCount` (ברירת מחדל 3) ו-`loopGuardWindowMs` (ברירת מחדל 10 דקות). לאחר שמספר החזרות מוצלחות עברו את הסף בחלון הגולש, המנוע **משהה את עצמו** — כל `autoRollback` נוסף מוחזר כ-`BLOCKED_LOOPGUARD` עד ש-אופרטור אנושי מפעיל `resume(operator)`. ההשהיה לעולם אינה מתבטלת אוטומטית.

### 4.3 Destructive migration / מיגרציית נתונים הרסנית

Built-in SQL scanner flags:

| Pattern            | Reason                                  |
|--------------------|-----------------------------------------|
| `DROP TABLE`       | drops data permanently                  |
| `DROP COLUMN`      | drops data permanently                  |
| `DROP DATABASE`    | catastrophic                            |
| `DROP SCHEMA`      | catastrophic                            |
| `TRUNCATE`         | removes all rows                        |
| `DELETE` w/o WHERE | removes all rows                        |
| `ALTER COLUMN TYPE`| narrowing may lose data                 |
| `RENAME TABLE/COL` | rollback needs compat layer             |

Custom checks are registered via `registerMigrationCheck(name, fn)`. A custom check that throws is treated as **unsafe** (fail-closed) — you cannot fix a broken safety check by ignoring it.

סורק SQL מובנה מסמן את הדפוסים למעלה כהרסניים. בדיקות מותאמות נרשמות דרך `registerMigrationCheck`. בדיקה מותאמת שזורקת שגיאה נחשבת כ-"לא בטוחה" (כשלון סגור).

### 4.4 Dependency order / סדר תלות

`registerDependency('web', ['api'])` declares that `web` depends on `api`. `getDependencyOrder('web')` returns a topologically-sorted array (upstream first) that the executor uses to roll back services in the right order. Cycles throw immediately — the engine refuses to reason about a cyclic graph.

## 5. Outcome Codes / קודי תוצאה

| Code                  | EN                     | HE                          |
|-----------------------|------------------------|-----------------------------|
| `success`             | Rollback succeeded     | הצלחה                       |
| `failed`              | Executor raised/ok:false | כשל                         |
| `blocked-freeze`      | Freeze window blocked  | חסום — חלון הקפאה           |
| `blocked-loopguard`   | Loop-guard blocked     | חסום — שומר לולאות          |
| `blocked-migration`   | Destructive migration  | חסום — מיגרציה הרסנית       |

## 6. Test Coverage / כיסוי בדיקות

**21 tests, all passing** (`node --test test/devops/rollback-engine.test.js`):

| # | Test                                                        | Covers                                 |
|---|-------------------------------------------------------------|----------------------------------------|
| 01| registerTrigger validates arguments                         | input validation                       |
| 02| watch reports no breach when metric below threshold         | happy-path watch                       |
| 03| watch requires persisted duration to be ready               | duration gating                        |
| 04| breach counter resets when metric recovers                  | hysteresis                             |
| 05| freeze window blocks auto-rollback                          | freeze guard                           |
| 06| manualRollback bypasses freeze window                       | operator override                      |
| 07| loop-guard pauses engine after N rollbacks in window        | loop-guard trigger                     |
| 08| paused engine blocks further auto-rollbacks until resume    | paused state                           |
| 09| loop-guard window slides over time                          | window correctness                     |
| 10| getDependencyOrder returns upstream-first topological order | dependency order                       |
| 11| dependency cycle is detected and throws                     | cycle detection                        |
| 12| scanMigrationSql flags destructive operations               | built-in SQL scanner                   |
| 13| autoRollback blocks destructive migration plan              | migration guard (auto)                 |
| 14| manualRollback respects destructive migration unless forced | migration guard (manual + force)       |
| 15| custom migration check runs and flags plan                  | pluggable checks                       |
| 16| custom migration check that throws is treated as unsafe     | fail-closed                            |
| 17| executor failure is recorded as FAILED outcome              | executor error handling                |
| 18| bilingual summary contains English and Hebrew labels        | bilingual output                       |
| 19| history preserves every incident (never-delete)             | append-only & frozen records           |
| 20| metric function throwing is isolated                        | metric resilience                      |
| 21| freeze validates start/end/reason                           | freeze input validation                |

```
$ cd onyx-procurement && node --test test/devops/rollback-engine.test.js
  ...
  tests 21
  pass  21
  fail  0
```

## 7. Never-Delete Compliance / עמידה בעקרון ״לא מוחקים״

1. Registering a trigger with an existing name **does not** delete the previous trigger — the old trigger metadata is kept via the `supersedes` field.
2. Freeze windows are **never** removed; expired windows remain in `_freezeWindows` for audit.
3. Incidents are stored in an **append-only** list; when the list exceeds `maxHistory` (default 1000) the oldest entries move to an `_archive` array — still in memory, still queryable via `history().archived`.
4. Incident records are `Object.freeze`-d at creation time; mutating them in strict mode throws.
5. `resume()` is the only way to lift a loop-guard pause, and even then the pause event itself is recorded as a `resume` incident in history.

1. רישום טריגר עם שם קיים אינו מוחק את הטריגר הקודם — המטא-דאטא שלו נשמר בשדה `supersedes`.
2. חלונות הקפאה לעולם אינם נמחקים; חלונות שפגו נשמרים ב-`_freezeWindows` לצרכי ביקורת.
3. אירועים נשמרים ברשימה בלתי-מחיקה; עודף עובר למערך `_archive` וניתן לשלוף דרך `history().archived`.
4. רשומות אירועים מוקפאות ב-`Object.freeze`; ניסיון לשנות אותן במצב מחמיר זורק שגיאה.
5. `resume()` היא הדרך היחידה להסיר השהיה של שומר הלולאות, והסרת ההשהיה עצמה נרשמת כאירוע `resume`.

## 8. Integration Notes / הערות אינטגרציה

1. **Executor contract:** callers must provide an async function that performs the real rollback side effect. Returning `{ ok: false, error }` is the soft-failure path; throwing is the hard-failure path. Both become `FAILED` incidents with the error text captured.
2. **Scheduler:** the engine does not run its own clock — callers should invoke `engine.watch(releaseId)` on a cadence (e.g. every 10 seconds from an existing health-check loop) and pass the result to `autoRollback` when `report.ready === true`.
3. **Alerting:** when `loopGuardStatus().pausedByLoopGuard === true`, page a human. The pause state will persist until `engine.resume(operator)` is called.
4. **Bridging to onyx-ai:** the `incidentSummary()` Markdown is safe to paste directly into a Slack / WhatsApp message; it contains no secrets and is already bilingual.

## 9. Files / קבצים

| File                                                           | Lines | Purpose                            |
|----------------------------------------------------------------|-------|------------------------------------|
| `onyx-procurement/src/devops/rollback-engine.js`               | ~560  | Engine implementation              |
| `onyx-procurement/test/devops/rollback-engine.test.js`         | ~310  | 21 unit tests                      |
| `_qa-reports/AG-Y179-rollback-engine.md`                       | this  | Bilingual QA report                |

## 10. Sign-off / חתימה

- [x] 21 / 15+ unit tests green
- [x] Node built-ins only (`node:test`, `node:assert/strict`) — zero external deps
- [x] Bilingual report (English + Hebrew)
- [x] Never-delete rule enforced at five distinct layers
- [x] All required features: triggers, watch, autoRollback, manualRollback, freeze, loopGuard, bilingual summary, dependencies, data-migration safety check

**Status:** READY FOR REVIEW / מוכן לסקירה
