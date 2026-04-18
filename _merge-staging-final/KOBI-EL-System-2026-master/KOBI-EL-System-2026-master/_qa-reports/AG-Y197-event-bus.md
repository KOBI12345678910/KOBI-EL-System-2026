# AG-Y197 — Cross-Module Event Bus

**Agent:** Y-197
**System:** Techno-Kol Uzi mega-ERP / Onyx-Procurement
**Date:** 2026-04-11
**Module:** `onyx-procurement/src/wiring/event-bus.js`
**Test file:** `onyx-procurement/test/wiring/event-bus.test.js`
**Status:** PASS — 20 / 20 tests green
**Dependencies:** zero external (Node.js built-ins only — `node:events`, `node:crypto`)

---

## 1. Purpose / מטרה

### English
Provide the backbone of the cross-module choreography layer in the
Techno-Kol Uzi mega-ERP. `EventBus` allows every vertical (procurement,
finance, inventory, HR, compliance...) to emit and consume strongly
typed business events without a direct module dependency. The bus is
in-process, single-node, and dependency-free — it is the fallback used
when a Kafka / NATS edge is unavailable, and the contract surface that
external brokers must preserve.

### עברית (RTL)
‫מנוע תזמון אירועים בין-מודולרי עבור Techno-Kol Uzi mega-ERP.‬
‫כל מודול במערכת (רכש, כספים, מלאי, משאבי אנוש, רגולציה...) משדר ומאזין‬
‫לאירועים עסקיים מוגדרי טיפוס, ללא תלות ישירה בין המודולים.‬
‫הרכיב פועל בתוך תהליך יחיד, ללא תלויות חיצוניות, ומשמש כבסיס־חוזה עבור‬
‫כל ברוקר חיצוני (Kafka / NATS) שיתווסף בעתיד.‬

---

## 2. Feature matrix / מטריצת תכולה

| # | Feature | HE | EN | Implementation |
|---|---|---|---|---|
| 1 | Typed events | אירועים מוגדרי טיפוס | Typed events | `registerEventType` + `DEFAULT_EVENT_TYPES` |
| 2 | Bilingual registry | רישום דו־לשוני | Bilingual labels enforced | throws on missing `he` or `en` |
| 3 | Sync subscribers | מנויים סינכרוניים | Sync subscribers | priority-ordered in-line delivery |
| 4 | Async subscribers | מנויים א־סינכרוניים | Async subscribers | awaited by `publishWithAck` |
| 5 | Priority ordering | סדר עדיפות | Priority ordering | `{priority}` option, desc + stable seq |
| 6 | Wildcard subs | מנויי תבניות | Wildcard subscriptions | `*`, `**`, `procurement.*`, `*.*.created` |
| 7 | Dead letter queue | תור שגיאות מנויים | Dead letter queue | every throw captured; never re-thrown |
| 8 | Replay support | שחזור אירועים | Replay by event id | `replay(eventId)` — meta.isReplay=true |
| 9 | Audit log (append-only) | יומן ביקורת צמיחה־בלבד | Append-only audit log | `_appendAudit`, monotonic `seq` |
| 10 | Backpressure | ויסות עומס | Backpressure handling | `highWaterMark` + `stats.backpressureApplied` |
| 11 | Typed envelope | מעטפת קנונית | Canonical envelope | `_envelope(raw)` → { id, type, payload, meta } |
| 12 | Drain / ack | המתנה לניקוי תור | Drain / ack | `drain()` + `publishWithAck` |

---

## 3. Public API / ממשק ציבורי

| Method | Purpose |
|---|---|
| `new EventBus({ highWaterMark, initialTypes, now })` | Construct bus — defaults: HWM = 1000 |
| `registerEventType(type, spec)` | Register a bilingual type (throws on conflict) |
| `describeType(type)` | Returns `{ he, en }` labels (falls back to the type name) |
| `subscribe(eventType, handler, { priority, async, id })` | Register a subscriber, returns a token |
| `unsubscribe(token)` | Flags `removed=true`; the row stays in the audit |
| `publish(event)` | Fire-and-forget; sync handlers run in-phase |
| `publishWithAck(event)` | Awaits sync + async handlers; returns a summary |
| `replay(eventId)` | Re-dispatches a journalled event (new id, isReplay=true) |
| `drain()` | Waits for the async in-flight queue to empty |
| `deadLetterQueue` (getter) | Immutable snapshot of failed deliveries |
| `auditLog` (getter) | Immutable snapshot of every audit row |
| `journal` (getter) | Immutable snapshot of every published event |
| `stats` (getter) | counters + inflight + subscribers + dlqSize |
| `eventTypes` (getter) | Snapshot of the currently registered type catalogue |

---

## 4. Event envelope / מעטפת אירוע

Every published event is wrapped in a canonical envelope, regardless of
how the caller constructed it:

```
{
  id:      "evt_<16 hex>",           // assigned if missing
  type:    "procurement.po.created", // required
  payload: { ... },
  meta: {
    source:        "onyx-procurement",
    correlationId: "corr_abc",
    ts:            "2026-04-11T00:00:00.000Z",
    isReplay:      false,
    replayOf:      null
  }
}
```

- `meta.isReplay` distinguishes replayed deliveries from first-time
  dispatches — downstream idempotency checks should short-circuit on
  this flag.
- `meta.correlationId` chains multi-step workflows across modules.
- The envelope is stable across `publish`, `publishWithAck`, and
  `replay` — handlers never see a raw caller object.

---

## 5. Wildcard semantics / סמנטיקת תבניות

| Pattern | Matches |
|---|---|
| `procurement.po.created` | that exact type only |
| `procurement.*` | exactly one extra segment (`procurement.X`) |
| `procurement.**` | zero or more trailing segments |
| `*.*.created` | three-segment types whose last segment is `created` |
| `*` or `**` | catch-all (everything) |

Subscribers with wildcard patterns are ordered together with exact-match
subscribers purely by `{priority, seq}` — there is no automatic
ranking by specificity. Specificity should be expressed via explicit
`priority` values.

---

## 6. Iron rule — nothing is deleted / כלל הברזל — לא מוחקים

- `unsubscribe()` flags `removed=true` on the subscription row; the
  row itself is preserved forever. `stats.totalSubscriptionsEver`
  always reflects every subscription ever made.
- The event journal (`_journal`) is an append-only `Map`. Replays
  read from the journal and do NOT re-journal the replay as a new
  event — they add a `replay` entry to the audit log instead.
- The audit log (`_audit`) is append-only with a monotonic `seq`
  field. There is no public method that mutates a prior row.
- The dead-letter queue (`_dlq`) is append-only. Redriving a DLQ
  row (future work) would emit a new delivery, never mutate the
  existing failure.

---

## 7. Test run / ריצת בדיקות

```
$ cd onyx-procurement && node --test test/wiring/event-bus.test.js

✔ 01 registerEventType — rejects missing bilingual labels
✔ 02 registerEventType — idempotent on identical spec
✔ 03 registerEventType — conflicting re-registration throws
✔ 04 subscribe — exact match delivers to handler
✔ 05 subscribe — higher priority runs first
✔ 06 subscribe — stable order when priorities tie
✔ 07 subscribe — "procurement.*" wildcard
✔ 08 subscribe — "*.*.created" wildcard matches any created
✔ 09 subscribe — catch-all "**" receives everything
✔ 10 publish — sync handler delivered before publish returns
✔ 11 publishWithAck — awaits async subscribers
✔ 12 handler throw — DLQ captures failure, other handlers still run
✔ 13 unsubscribe — row is flagged but NEVER deleted
✔ 14 replay — re-dispatches original event, flagged isReplay
✔ 15 replay — unknown event id throws
✔ 16 auditLog — append-only with monotonic seq
✔ 17 backpressure — HWM=1 triggers the backpressure counter
✔ 18 stats — published/delivered/failed/replayed counters
✔ 19 patternToMatcher — wildcard semantics
✔ 20 DEFAULT_EVENT_TYPES — frozen catalogue is bilingual

ℹ tests 20
ℹ pass 20
ℹ fail 0
ℹ duration_ms ≈ 112
```

**Coverage of specification requirements:**

| Requirement | Test(s) |
|---|---|
| Typed events registry | 01, 02, 03, 20 |
| Sync subscribers | 04, 05, 06, 10 |
| Async subscribers | 11, 17 |
| Priority ordering | 05, 06 |
| Wildcard subscriptions | 07, 08, 09, 19 |
| Dead letter queue for failures | 12, 18 |
| Replay by event id | 14, 15, 18 |
| Append-only audit log | 13, 16 |
| Backpressure handling | 17 |
| Bilingual event registry | 01, 02, 20 |
| Stats & counters | 12, 17, 18 |

---

## 8. Default event catalogue / קטלוג אירועים בסיסי

| Type | Owner | HE | EN |
|---|---|---|---|
| `procurement.po.created` | onyx-procurement | הזמנת רכש נוצרה | Purchase order created |
| `procurement.po.approved` | onyx-procurement | הזמנת רכש אושרה | Purchase order approved |
| `procurement.grn.received` | onyx-procurement | תעודת כניסה למחסן | Goods received note |
| `finance.invoice.posted` | onyx-finance | חשבונית נרשמה בספרים | Invoice posted to ledger |
| `finance.payment.dispatched` | onyx-finance | תשלום הועבר | Payment dispatched |
| `inventory.stock.updated` | onyx-warehouse | מלאי עודכן | Stock level updated |
| `hr.employee.hired` | onyx-hr | עובד חדש נקלט | Employee hired |
| `compliance.audit.flag` | onyx-compliance | דגל ביקורת | Audit flag raised |

Verticals add their own types via `bus.registerEventType(type, spec)`.
The default catalogue is `Object.freeze`-d and cannot be mutated at
runtime; `registerEventType` is the only way to extend it.

---

## 9. Invariant audit / ביקורת אינוריאנטים

### English — what the bus **cannot** do
1. It has no `delete()` method. `unsubscribe` only flags a row;
   the row and every audit entry survive forever.
2. A thrown handler cannot propagate out of `publish` or
   `publishWithAck`. It is captured in the DLQ, counted in
   `stats.failed`, and its siblings continue to run.
3. A replay never mutates the journal. It reads the original
   envelope, creates a new id, sets `meta.isReplay=true`, and
   appends a `replay` row to the audit log.
4. `DEFAULT_EVENT_TYPES` is `Object.freeze`-d at the top level AND
   each nested spec/labels object is frozen — runtime tampering
   raises TypeErrors in strict mode.
5. Registering the same type twice with the same spec is a no-op;
   registering it twice with a different spec throws with a
   bilingual error message.
6. Backpressure is a flag, not a drop. Events above HWM are still
   processed; the counter `stats.backpressureApplied` lets ops
   dashboards raise alerts without losing data.

### עברית (RTL)
‫1. באוטובוס אין שום פונקציית delete. `unsubscribe` רק מסמן שורה כהוסרה;‬
‫   השורה עצמה וכל רשומות הביקורת נשמרות לעולמי עד.‬
‫2. חריגה שנזרקת ממנוי לא תחצה את `publish` או `publishWithAck` —‬
‫   היא נלכדת בתור שגיאות המנויים, מופיעה ב־`stats.failed`, והאחים‬
‫   ממשיכים לרוץ כרגיל.‬
‫3. שחזור אירוע אינו משנה את היומן. הוא קורא את המעטפה המקורית,‬
‫   יוצר מזהה חדש, מסמן `meta.isReplay=true`, ומוסיף שורת `replay`‬
‫   ליומן הביקורת.‬
‫4. `DEFAULT_EVENT_TYPES` קפוא (`Object.freeze`) ברמת העל וגם בכל‬
‫   ספק/תוויות מקוננים. כל ניסיון שינוי זורק TypeError במצב קפדני.‬
‫5. רישום אותו טיפוס פעמיים עם אותו מפרט הוא no-op; רישום עם מפרט שונה‬
‫   זורק שגיאה דו־לשונית.‬
‫6. ויסות העומס מסומן בלבד — לא נזרק אירוע. אירועים מעל רף ה־HWM‬
‫   עדיין מעובדים, ומונה `stats.backpressureApplied` מאפשר התרעה‬
‫   בדשבורד תפעולי ללא אובדן נתונים.‬

---

## 10. Known limitations / מגבלות ידועות

- **Single process.** The bus runs in-process only. A multi-node
  deployment should plug in a broker adapter that listens on the
  bus and mirrors every `publish` to Kafka / NATS / PostgreSQL
  LISTEN — the bus itself does not speak network.
- **In-memory journal.** The event journal is a `Map` — restarting
  the process clears the replay cache. A production deployment
  should persist `journal` to a durable store on each publish.
- **Async ordering is per-event, not global.** Async handlers for
  a single publish run sequentially in priority order, but
  handlers for different publishes may interleave freely. This is
  intentional — it keeps the backpressure gauge coherent.
- **No schema enforcement.** The `shape` field on each event type
  is currently advisory. A future iteration can hook `publish` to
  validate payloads with AJV or a handwritten checker — the
  signature is already in place.
- **Specificity is explicit.** Wildcard subs do not outrank exact
  subs automatically — callers express intent via `priority`.

---

## 11. Files delivered / קבצים שסופקו

1. `onyx-procurement/src/wiring/event-bus.js` — engine (≈ 520 LoC)
2. `onyx-procurement/test/wiring/event-bus.test.js` — 20 tests (≈ 360 LoC)
3. `_qa-reports/AG-Y197-event-bus.md` — this bilingual report

**Compliance principle honoured / עיקרון נשמר:**
_"לא מוחקים — רק משדרגים ומגדלים."_
_"We do not delete — we only upgrade and grow."_
