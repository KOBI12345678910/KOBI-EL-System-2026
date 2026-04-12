# AG-Y033 — Work Order Scheduler / מתזמן פקודות עבודה

> Status: **PASS** — 25/25 tests green
> Run date: 2026-04-11
> Module: `onyx-procurement/src/manufacturing/wo-scheduler.js`
> Tests: `onyx-procurement/test/manufacturing/wo-scheduler.test.js`
> Agent: **Y-033**, Techno-Kol Uzi mega-ERP, Israeli metal-fab context.

---

## 1. Mission / משימה

Build a **finite-capacity Work Order scheduler** for a multi-shift Israeli
metal-fabrication shop.  Must support:

- **Forward** (earliest finish) and **Backward** (latest start) scheduling
- Concurrent **slots per work center** (e.g. two lasers in parallel)
- **Israeli holiday calendar** (Rosh Hashana, Yom Kippur, Sukkot, Pesach,
  Shavuot, Yom HaAtzmaut, …)
- **Shabbat off** by default, **Friday capped at 14:00**
- 5 dispatch rules: **EDD / SPT / FCFS / CR / SLACK**
- **Capacity report** with overload highlights
- **Gantt data** in a Palantir dark-theme/RTL ready shape
- **Reschedule** on disruption (material delay, machine breakdown)
- **What-if** simulation that **must not mutate** live state
- **Priority escalation** (audit-logged, never deleted)
- **Append-only change log** per WO
- 100% in-memory, **zero external dependencies**, pure Node built-ins
- Hebrew RTL + bilingual labels everywhere

### Immutable rule
**“לא מוחקים רק משדרגים ומגדלים”** — *we never delete; we only upgrade
and grow*.  The legacy `WorkOrderScheduler` class (1100+ LOC) is preserved
verbatim.  The new functionality lives in a brand-new sibling class
**`WOScheduler`** appended to the same module.  Both are exported.

---

## 2. Deliverables / תוצרים

| File | Lines | Purpose |
|------|-------|---------|
| `onyx-procurement/src/manufacturing/wo-scheduler.js` | ~1900 | legacy + new `WOScheduler` |
| `onyx-procurement/test/manufacturing/wo-scheduler.test.js` | ~480 | 25 unit tests (Node `node:test`) |
| `_qa-reports/AG-Y033-wo-scheduler.md` | this file | bilingual QA report |

### Test run
```
$ node --test test/manufacturing/wo-scheduler.test.js
ℹ tests 25
ℹ suites 0
ℹ pass 25
ℹ fail 0
ℹ duration_ms 127.5
```

---

## 3. Class API / ממשק המחלקה

```js
const { WOScheduler } = require('./src/manufacturing/wo-scheduler');
const s = new WOScheduler({ now: '2026-04-13T07:00:00Z' });
```

| Method | Hebrew | Description |
|--------|--------|-------------|
| `defineWorkCenter(wc)` | הגדרת מרכז עבודה | seed a work center w/ slots and calendar |
| `setWorkCenterCalendar(wcId, cal)` | הגדרת לוח שנה | shifts / breaks / holidays / Shabbat |
| `addWO({id, partNumber, qty, routing, priority, dueDate})` | פתיחת פקודת עבודה | register a WO from a routing |
| `scheduleForward(wo, startDate)` | תזמון קדימה | earliest-finish from a start anchor |
| `scheduleBackward(wo, dueDate)` | תזמון אחורה | latest-start to meet `dueDate`; flags infeasibility |
| `dispatch(wcId, rule)` | רשימת שיגור | sort the queue by EDD / SPT / FCFS / CR / SLACK |
| `capacityReport(wcId, period)` | דו"ח קיבולת | per-day load %, overload highlights |
| `ganttData(period)` | נתוני גאנט | Palantir dark theme + RTL ready payload |
| `reschedule(woId, opts)` | תזמון מחדש | re-plan after material delay or breakdown |
| `whatIf(changes)` | סימולציית "מה אם" | non-mutating sandbox |
| `priorityEscalate(woId, prio, reason)` | הסלמת עדיפות | audit-logged, no delete |
| `listHolidays(year)` | חגים | 2026 Israeli holiday list |
| `getChangeLog(woId)` | יומן שינויים | append-only audit trail |

---

## 4. Algorithm explanation / הסבר אלגוריתמי

### 4.1 Forward scheduling — תזמון קדימה
1. Walk routing operations in `seq` order.
2. For each op, advance the cursor by the op's `queueMin` along the
   work-center calendar (skipping non-working time).
3. Call `_findFiniteForwardSlot(wcId, cursor, durationMin)`:
   - For each parallel slot `0..slots-1`, replay that slot's bookings,
     find the earliest gap that fits `durationMin` open minutes.
   - The slot whose candidate start is **earliest in time** wins
     (greedy slot allocation).
4. Book the slot, advance the cursor by `moveMin`, repeat.
5. `wo.plannedStart` = first op start; `wo.plannedEnd` = last op end.

### 4.2 Backward scheduling — תזמון אחורה
1. Walk routing in **reverse** seq order, anchored at `dueDate`.
2. Subtract `moveMin` first (the move *out* of this op).
3. `_findFiniteBackwardSlot` mirrors the forward search: for each slot,
   walk bookings from latest to earliest, find the latest gap that fits.
4. Subtract `queueMin` to get the cursor for the previous op.
5. **Infeasibility check**: if `wo.plannedStart < this.now()`, set
   `wo.feasible = false` and append `wo.infeasible` to the change log.

### 4.3 Calendar-aware time math
The two helpers `_addOpenMinutes` and `_subOpenMinutes` accumulate /
subtract **minutes that are inside an open shift**, hopping over:

- Shabbat (Saturday, UTC day 6) when `shabbatOff` is true (default)
- Israeli statutory holidays (per `listHolidays(year)`)
- Per-work-center extra holidays
- Friday cap at 14:00 (`FRIDAY_LAST_MIN`)
- Configured break windows
- The gaps between configured shifts

### 4.4 Finite-capacity slot allocation
Each work center has a `slots` count (e.g. 2 lasers, 1 bend press, 1
weld cell).  Bookings carry a `slotIdx`.  The slot search is **greedy**:
the first slot to offer the earliest start wins, no global optimisation.
This is exactly what the brief requested ("greedy slot allocation —
earliest available").

### 4.5 Reschedule
`reschedule(woId, { delayMin, startDate, direction, reason })`:
- removes the WO's bookings,
- recomputes a new start (`now + delayMin`, an explicit `startDate`,
  or `now()` if neither given),
- re-runs forward (default) or backward,
- writes a `wo.rescheduled` entry into the change log with both the
  previous and the next start/end.

### 4.6 What-if (non-mutating)
`whatIf(changes)` snapshots **all** in-memory state (`workOrders`,
`workCenters`, `changeLog`) into deep clones, applies the changes,
captures the resulting view (`{ wos, gantt }`), and **always** restores
the snapshot in the `finally` block — even if a change throws.  Test #19
verifies that no live mutation leaks.

---

## 5. Dispatch rules / כללי שיגור

| Rule | English | Hebrew | Sort key | Use case |
|------|---------|--------|----------|----------|
| **EDD** | Earliest Due Date | יעד אספקה מוקדם ביותר | `dueDate` ascending | classic delivery focus |
| **SPT** | Shortest Processing Time | זמן עיבוד קצר ביותר | `processingMin` ascending | minimises queue time at the bottleneck |
| **FCFS** | First-Come First-Served | ראשון נכנס – ראשון מוגש | `createdAt` ascending | fair queueing on the shop floor |
| **CR** | Critical Ratio | יחס קריטי | `(minsToDue / remainingMin)` ascending | balances slack vs. work remaining |
| **SLACK** | Least Slack | מרווח (slack) מינימלי | `(minsToDue − remainingMin)` ascending | hard-deadline triage |

> A lower **CR (< 1)** means the WO is *behind* (more work remaining
> than time left).  CR = ∞ means the WO has no due date.

---

## 6. Israeli 2026 holidays / חגים ישראל 2026

| Date | English | עברית |
|------|---------|-------|
| 2026-03-03 | Purim | פורים |
| 2026-04-02 | Pesach Eve | ערב פסח |
| 2026-04-03 | Pesach Day 1 | פסח – יום ראשון |
| 2026-04-09 | Pesach Day 7 | שביעי של פסח |
| 2026-04-22 | Yom HaShoah | יום השואה |
| 2026-04-29 | Yom HaZikaron | יום הזיכרון |
| 2026-04-30 | Yom HaAtzmaut (Independence Day) | יום העצמאות |
| 2026-05-22 | Shavuot | שבועות |
| 2026-09-11 | Rosh Hashana Eve | ערב ראש השנה |
| 2026-09-12 | Rosh Hashana Day 1 | ראש השנה – יום א' |
| 2026-09-13 | Rosh Hashana Day 2 | ראש השנה – יום ב' |
| 2026-09-20 | Yom Kippur Eve | ערב יום כיפור |
| 2026-09-21 | Yom Kippur | יום כיפור |
| 2026-09-25 | Sukkot Eve | ערב סוכות |
| 2026-09-26 | Sukkot Day 1 | סוכות – יום ראשון |
| 2026-10-03 | Simchat Torah | שמחת תורה |

> 16 entries total — verified by test #10.
> **Shabbat** (Saturday) is off by default; **Friday** is automatically
> capped at 14:00 to model the Israeli short-day convention.

---

## 7. Change-log format / יומן שינויים

Append-only, per WO.  Every entry carries `at` (ISO timestamp) and a
`type` enum:

| `type` | Emitted by | Payload |
|--------|------------|---------|
| `wo.created` | `addWO` | `partNumber, qty, priority, dueDate` |
| `wo.scheduled.forward` | `scheduleForward` | `start, end` |
| `wo.scheduled.backward` | `scheduleBackward` | `start, end, feasible` |
| `wo.infeasible` | `scheduleBackward` (when infeasible) | `reason, latestStart, now` |
| `wo.rescheduled` | `reschedule` | `reason, direction, previous, next, delayMin` |
| `wo.priority.escalated` | `priorityEscalate` | `from, to, reason` |

The log is **never trimmed**, **never overwritten**, and is exposed via
`getChangeLog(woId)`.  Test #23 walks through six entries (created → forward →
escalated → rescheduled → forward → escalated) and asserts ordering.

---

## 8. Test matrix / מטריצת בדיקות

| # | Test | Verifies |
|---|------|----------|
| 1 | scheduleForward single WO | end > start, all ops planned, feasible |
| 2 | multi-WO contention | bend bottleneck pushes second WO |
| 3 | parallel laser slots | 2 WOs share laser, different `slotIdx` |
| 4 | shift spillover | work over end-of-shift slides into the next morning |
| 5 | scheduleBackward feasible | feasible flag, start ≥ now |
| 6 | scheduleBackward infeasible | feasible=false + `wo.infeasible` log |
| 7 | Pesach Day-1 skip | 2026-04-03 skipped |
| 8 | Yom Kippur skip | 2026-09-21 skipped |
| 9 | Shabbat default off | Saturday rolls to Sunday |
| 10 | `listHolidays(2026)` | 16-entry canonical list |
| 11 | dispatch EDD | sorted by due date |
| 12 | dispatch SPT | sorted by processing time |
| 13 | dispatch FCFS | sorted by createdAt |
| 14 | dispatch CR | most urgent CR first |
| 15 | dispatch SLACK | least slack first |
| 16 | capacityReport overload | overloadDays surfaced |
| 17 | capacityReport avg load | avgLoadPct computed |
| 18 | ganttData theme | palantir-dark + rtl + Hebrew labels |
| 19 | whatIf non-mutation | live state untouched |
| 20 | reschedule (material delay) | start shifted forward |
| 21 | reschedule (breakdown) | starts at the supplied recovery time |
| 22 | priorityEscalate | audit logged + escalations[] |
| 23 | change log append-only | entries preserved across reschedules |
| 24 | addWO duplicate guard | original survives, new rejected |
| 25 | setWorkCenterCalendar | custom shifts + holidays installed |

**Total: 25 tests, all passing.**

---

## 9. Hebrew glossary / מילון עברי-אנגלי

| English | עברית | Notes |
|---------|--------|-------|
| Work order | פקודת עבודה | the central object — `WO-…` |
| Work center | מרכז עבודה | bottleneck or station |
| Routing | מסלול ייצור | ordered list of operations |
| Operation | פעולה | row inside a routing |
| Setup time | זמן הכנה | one-shot per op (`setupMin`) |
| Run time | זמן ריצה | per-unit (`runMinPerUnit × qty`) |
| Queue time | המתנה בתור | wait at work center inbox |
| Move time | זמן מעבר | transit between stations |
| Forward schedule | תזמון קדימה | early-start, anchored on a start date |
| Backward schedule | תזמון אחורה | late-start, anchored on a due date |
| Critical ratio | יחס קריטי | `time-to-due / work-remaining` |
| Slack | מרווח | `time-to-due − work-remaining` |
| Capacity | קיבולת | minutes available per day |
| Overload | עומס יתר | booked > capacity |
| Dispatch list | רשימת שיגור | sequenced queue per work-center |
| Slot | תא ייצור | one of N parallel resources at a center |
| Shabbat | שבת | weekly off day |
| Holiday | חג | Israeli statutory holiday |
| Material delay | עיכוב חומר | reason code for reschedule |
| Breakdown | תקלה / השבתה | machine failure |
| What-if | מה-אם / סימולציה | non-destructive simulation |
| Escalation | הסלמה | bump priority + audit |
| Audit log | יומן ביקורת | append-only history |
| OTD | עמידה ביעד אספקה | on-time delivery KPI (legacy class) |

---

## 10. RTL & accessibility / נגישות וכיווניות

- `ganttData` carries `rtl: true` and `theme: 'palantir-dark'` so the
  client renderer never has to guess.
- Every public payload (`dispatch`, `capacityReport`, `ganttData`,
  `getWorkCenter`, `listHolidays`) carries `*_he` labels alongside the
  English ones.
- ID generators use ASCII (`WO-…`, `WC-…`) so IDs survive bidi.
- Date parsing always normalises to UTC ISO before any math, avoiding
  Israeli summer-time pitfalls.

---

## 11. Compliance with the immutable rules

| Rule | Status |
|------|--------|
| לא מוחקים רק משדרגים ומגדלים | **PASS** — legacy `WorkOrderScheduler` class kept verbatim, new `WOScheduler` appended; both exported |
| Zero external deps — Node built-ins only | **PASS** — only `node:test` + `node:assert/strict` |
| Hebrew RTL + bilingual labels | **PASS** — every payload carries `*_he` labels, gantt sets `rtl: true` |
| Israeli metal-fab context | **PASS** — Shabbat default off, Friday cap at 14:00, 16 holidays, work-centers modelled as laser/bend/weld |
| Append-only change log | **PASS** — `getChangeLog` never trims, test #23 verifies six-entry chain |
| In-memory storage (Map) | **PASS** — `Map` for `workCenters`, `workOrders`, `changeLog` |

---

## 12. Files (absolute paths)

- `C:/Users/kobi/OneDrive/kobi/המערכת 2026  KOBI EL/onyx-procurement/src/manufacturing/wo-scheduler.js`
- `C:/Users/kobi/OneDrive/kobi/המערכת 2026  KOBI EL/onyx-procurement/test/manufacturing/wo-scheduler.test.js`
- `C:/Users/kobi/OneDrive/kobi/המערכת 2026  KOBI EL/_qa-reports/AG-Y033-wo-scheduler.md`

---

*End of report.*
