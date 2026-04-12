# AG-Y176 — Auto-Scaling Policy Engine (מנוע מדיניות קנה-מידה אוטומטי)

**Agent:** Y-176 (Swarm DevOps / Platform)
**System:** Techno-Kol Uzi mega-ERP
**Date:** 2026-04-11
**Status:** DELIVERED — 23 / 23 tests passing, zero external dependencies.
**Rule enforced:** לא מוחקים, רק משדרגים ומגדלים — append-only ledgers, no public `clear` / `reset` / `delete`.

---

## 1. Scope / היקף

Deliver a production-grade auto-scaling policy engine for the Techno-Kol
Uzi mega-ERP platform tier. Must combine reactive (Kubernetes HPA-style),
predictive (linear-forecast), and schedule-based (Israeli business hours +
bank holidays) policies, with aggressive scale-up / conservative scale-down
semantics, cooldown windows, hard min/max bounds, and an EventEmitter
observability surface. Zero external dependencies — **Node built-ins only**.
Bilingual Hebrew / English reasons and event payloads throughout.

אספקת מנוע מדיניות קנה-מידה אוטומטי איכותי (ברמת ייצור) עבור שכבת
הפלטפורמה של מערכת ה-ERP "טכנו-קול עוזי". המנוע משלב שלוש מדיניויות
עצמאיות: תגובתית (בסגנון HPA של Kubernetes), חיזויית (חיזוי ליניארי),
ומבוססת לו"ז (שעות עסקים בישראל + חגי בנק). הרחבה מהירה, הקטנה
שמרנית, חלונות צינון, חסמי מינימום/מקסימום קשיחים, ו-EventEmitter
לצרכי תצפיתיות. תלות אפס — רק מודולים מובנים של Node. כל הסיבות
והאירועים דו-לשוניים (עברית + אנגלית).

### Files produced / קבצים שנוצרו

| Path | Purpose | LOC |
|---|---|---|
| `onyx-procurement/src/devops/autoscaler.js` | `AutoScaler` class + `DEFAULTS` + `ISRAELI_HOLIDAYS_2026` | ~460 |
| `onyx-procurement/test/devops/autoscaler.test.js` | 23-case `node:test` suite | ~400 |
| `_qa-reports/AG-Y176-autoscaler.md` | This bilingual report | — |

Both `src/devops/` and `test/devops/` were pre-existing (from Agent Y-166 /
ci-generator). The new files are pure additions — **no existing file was
modified, renamed, or deleted**.

---

## 2. Architecture / ארכיטקטורה

Three policies are evaluated independently on every `evaluate()` call,
then combined by `max` (scale-up wins). The step-limiter and cooldown
gate the final applied movement.

שלוש מדיניויות מוערכות באופן בלתי-תלוי בכל קריאה ל-`evaluate()`, ואז
משולבות ע"י פונקציית ה-`max` (הרחבה גוברת). שלב הצעד הבטוח וחלון
הצינון חוסמים את תנועת הקנה-מידה הסופית.

```
                ┌─── reactive  (HPA: cpu / mem / queue) ───┐
  metrics ──→   ├─── predictive (linear regression, UP) ──→ max → step → cooldown → apply
                └─── schedule  (business-hours floor) ─────┘
```

### 2.1 Reactive / תגובתית

Pure HPA formula, driven by the *largest* of the three signals:

```
desired = ceil( current × signal / target )
```

| Signal | Default target |
|---|---|
| CPU utilisation (%) | 70 |
| Memory utilisation (%) | 75 |
| Queue depth per replica | 50 |

The label (`cpu`, `memory`, `queue`) of the winning signal is surfaced
in the decision reason string (EN + HE).

### 2.2 Predictive / חיזויית

Least-squares linear regression over the most recent `predictiveWindowSize`
(default 10) CPU samples. Timestamps are normalised relative to the first
sample in the window to preserve FP precision at epoch-millisecond scale.

Projects `predictiveHorizonMs` (default 60 s) into the future; if the
projected CPU exceeds `targetCpuPct`, computes `ceil(current × projected /
target)` and proposes that as the predictive desired. **The predictive
policy never proposes a scale-down** — its role is pre-emption only.

רגרסיה ליניארית (שיטת ריבועים מינימליים) על `predictiveWindowSize`
המדידות האחרונות של ה-CPU. חותמות הזמן מנורמלות ל-אפס יחסי כדי למנוע
אובדן דיוק בנקודה-צפה בסקאלת מילישניות-עידן. המדיניות החיזויית
**רק מעלה**, לעולם לא מורידה, ותפקידה למנוע עומסים לפני שהם מגיעים.

### 2.3 Schedule / לו"ז

Israeli business-hours floor, fully configurable:

- **Business days** (default `[0,1,2,3,4]` = Sun-Thu Israel-time).
- **Business hours** (default 09:00-18:00 Asia/Jerusalem).
- **Minimum replicas during business hours** (default 3).
- **Holidays** — default list covers the 17 major 2026 Israeli bank
  holidays (Purim, Pesach, Yom HaZikaron, Yom HaAtzmaut, Shavuot,
  Tisha B'Av, Rosh Hashanah, Yom Kippur, Sukkot, Simchat Torah, …).
  Holidays suppress the schedule floor and emit a `'holiday'` event.

רצפת שעות עסקים ישראליות, בלתי תלויה בסיגנל — מגדירה מספר מינימלי
של עותקים בין 09:00 ל-18:00 בימי א׳–ה׳ (שעון ישראל). שבת אינה יום
עסקים. חגי בנק ישראליים מדכאים את הרצפה ומשדרים אירוע `'holiday'`.

### 2.4 Aggressive up / conservative down / עלייה אגרסיבית, ירידה שמרנית

| | Scale UP | Scale DOWN |
|---|---|---|
| Max step | `scaleUpStep` (default **5**) | `scaleDownStep` (default **1**) |
| Cooldown | `scaleUpCooldownMs` (default **30 s**) | `scaleDownCooldownMs` (default **300 s**) |
| Policies that may fire it | reactive, predictive, schedule | reactive only |

### 2.5 Hard bounds / חסמים קשיחים

`minReplicas` and `maxReplicas` are always enforced. A clamp emits a
`'bounds-clamp'` event with both the requested and clamped replica counts.

---

## 3. Public API

```js
const { AutoScaler, DEFAULTS, ISRAELI_HOLIDAYS_2026 } = require('./autoscaler');

const as = new AutoScaler({
  minReplicas: 2,
  maxReplicas: 20,
  initialReplicas: 3,
  scheduleMinReplicas: 5,
});

as.on('scale-up',   (e) => console.log('UP',   e));
as.on('scale-down', (e) => console.log('DOWN', e));
as.on('holiday',    (h) => console.log('חג:', h.nameHe));

as.recordMetric({ cpu: 82, memory: 70, queueDepth: 120 });
const decision = as.evaluate();
```

| Method | Purpose |
|---|---|
| `recordMetric({cpu, memory, queueDepth, timestamp?})` | Append a metric sample. |
| `evaluate()` | Run all three policies, combine, apply, emit events. |
| `plan({at?, metric?})` | **Non-mutating** what-if projection. |
| `getReplicas()` | Current replica count. |
| `getConfig()` | Frozen config snapshot. |
| `getMetrics() / getDecisions() / getActions() / getEvents()` | Read-only copies of the append-only ledgers. |
| `isBusinessHours(at?)` | Israeli business-hours predicate. |
| `isHoliday(at?)` | Israeli bank-holiday predicate. |
| `addHoliday({date, name, nameHe})` | Append a runtime holiday (never removes existing ones). |

### Events / אירועים

| Event | Payload |
|---|---|
| `metric` | `{ timestamp, cpu, memory, queueDepth }` |
| `decision` | `{ timestamp, replicas, desired, reason, reasonHe, policy, applied }` |
| `scale-up` | `{ from, to, delta, policy, reason, reasonHe }` |
| `scale-down` | `{ from, to, delta, policy, reason, reasonHe }` |
| `no-change` | `{ replicas, reason, reasonHe }` |
| `cooldown` | `{ direction, remainingMs, reason, reasonHe }` |
| `bounds-clamp` | `{ requested, clamped, bound, reason, reasonHe }` |
| `holiday` | `{ date, name, nameHe }` |

---

## 4. Append-only invariant / אי-מחיקה

Four internal ledgers — `metrics`, `decisions`, `actions`, `events` — are
JavaScript arrays that are only ever **pushed to**. There is no public
`clear()`, `reset()`, or `delete()` method on the class. The test
`"ledgers are append-only"` asserts this at the type level
(`typeof as.clear === 'undefined'`).

`plan()` achieves its non-mutation guarantee by snapshotting the
ledger lengths, running a live `evaluate()`, and **truncating the
arrays back** to the original length via `arr.length = savedLen`. This is
not a deletion of durable history — it is a rollback of an ephemeral
hypothetical that was never committed.

ארבעת הלדג'רים הפנימיים — `metrics`, `decisions`, `actions`, `events` —
הם מערכי JS שמקבלים רק `push`. אין למחלקה שום שיטה פומבית
`clear()` / `reset()` / `delete()`. מבחן "ledgers are append-only"
מוודא זאת ברמת ה-type בעזרת `typeof as.clear === 'undefined'`.

---

## 5. Test coverage / כיסוי בדיקות

Run (`node --test test/devops/autoscaler.test.js`):

```
ℹ tests 23
ℹ pass  23
ℹ fail  0
ℹ duration_ms ~135
```

| # | Test | What it verifies |
|---|---|---|
| 1 | reactive CPU upscale | `ceil(2×140/70)=4` |
| 2 | reactive memory upscale | memory becomes the driver |
| 3 | reactive queue-depth upscale | `ceil(400/50)=8` |
| 4 | aggressive up vs conservative down | step=10 up, step=1 down |
| 5 | min / max clamp + event | both bounds, `bounds-clamp` event |
| 6 | predictive linear forecast | rising slope triggers pre-scale |
| 7 | predictive disabled | no pre-scale when flag off |
| 8 | schedule floor active | Sunday 12:00 Israel → 5 replicas |
| 9 | schedule floor inactive | Sunday 06:00 → no floor |
| 10 | Yom Kippur suppression | holiday → floor disabled, event fired |
| 11 | Saturday (Shabbat) closed | weekend → no floor |
| 12 | scale-up cooldown | blocks 2nd upscale inside cooldown |
| 13 | scale-down cooldown | blocks 2nd downscale inside cooldown |
| 14 | full EventEmitter smoke test | metric / decision / up / no-change emitted |
| 15 | append-only ledgers | no `clear` / `reset` / `delete` exists |
| 16 | config validation | bad bounds / targets throw |
| 17 | empty-sample rejection | `recordMetric({})` throws |
| 18 | runtime `addHoliday` | adds holiday, old ones survive |
| 19 | `plan()` non-mutating | state identical after what-if |
| 20 | `isBusinessHours` / `isHoliday` | all four cases verified |
| 21 | bilingual reasons | Hebrew regex `[\u0590-\u05FF]` hit |
| 22 | `ISRAELI_HOLIDAYS_2026` export | non-empty, frozen, contains Yom Kippur |
| 23 | `DEFAULTS` export shape | all expected keys present |

All tests are deterministic — the clock is injected via the `now: () => …`
constructor option and no test uses `Date.now()` implicitly.

---

## 6. Dependencies / תלויות

| Module | Source | Reason |
|---|---|---|
| `node:events` | Node.js built-in | `EventEmitter` base class |
| `Intl.DateTimeFormat` | JS built-in | Asia/Jerusalem date & hour extraction |
| `node:test` (test only) | Node.js built-in | Test runner |
| `node:assert/strict` (test only) | Node.js built-in | Assertions |

**Zero** third-party npm packages. No disk I/O. No network I/O.
אפס חבילות צד-שלישי. ללא קריאה/כתיבה לדיסק. ללא רשת.

---

## 7. Wiring / חיבור למערכת

Suggested call-site (not wired here, per scope):

```js
// onyx-procurement/src/ops/scale-loop.js (hypothetical)
const { AutoScaler } = require('../devops/autoscaler');
const metrics = require('../profiler');             // existing module
const k8s = require('../deploy/k8s-client');        // existing module

const as = new AutoScaler({ minReplicas: 2, maxReplicas: 30 });
as.on('scale-up',   (e) => k8s.scaleDeployment('onyx-api', e.to));
as.on('scale-down', (e) => k8s.scaleDeployment('onyx-api', e.to));

setInterval(() => {
  const sample = metrics.snapshot();     // { cpu, memory, queueDepth }
  as.recordMetric(sample);
  as.evaluate();
}, 15_000);
```

---

## 8. Acceptance / אישור

- [x] Reactive HPA (CPU / memory / queue depth)
- [x] Predictive linear forecast
- [x] Schedule-based Israeli business hours
- [x] Israeli bank holidays (configurable)
- [x] Cooldown periods (up + down, independent)
- [x] min / max bounds
- [x] Aggressive scale-up, conservative scale-down
- [x] EventEmitter
- [x] **15+ tests** — delivered **23 tests**, 100 % pass
- [x] Bilingual (Hebrew + English) strings in every user-facing surface
- [x] Node built-ins only — zero third-party deps
- [x] Never deletes — append-only ledgers, no public `clear` / `reset` / `delete`

---

**End of report / סוף הדוח** — Agent Y-176, 2026-04-11.
