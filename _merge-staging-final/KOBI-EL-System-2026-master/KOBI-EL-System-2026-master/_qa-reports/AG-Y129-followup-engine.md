# AG-Y129 — Automated Follow-up Engine

**Agent:** Y-129
**Module:** `onyx-procurement/src/comms/followup-engine.js`
**Tests:**  `onyx-procurement/test/comms/followup-engine.test.js`
**Version:** Y129.1.0
**Status:** Delivered
**Test result:** 26 / 26 pass (`node --test test/comms/followup-engine.test.js`)
**Rule enforced:** לא מוחקים רק משדרגים ומגדלים — every cadence
definition, enrollment, tick, skip, pause, resume, completion, and
emergency-stop is appended to an audit trail. Nothing is ever removed:
upgrading a cadence keeps the previous revision under `_revisions`,
skipping a step pushes onto `skips[]`, completing freezes state,
emergency-stop flips a flag but retains the enrollment record.

---

## 1. Purpose (מטרה)

**HE:** מנוע מעקב אוטומטי חוצה-ארגון שמפעיל רצפי תקשורת (cadences)
מבוססי-כללים אחרי אירועים — מכירות (opportunity-created, quote-sent,
demo-scheduled, lead-stuck), שירות (support-ticket-open, customer-
silent-90d), וגבייה (invoice-due-soon, invoice-overdue). המנוע אינו
שולח הודעות בעצמו; הוא פולט "מעטפות" (envelopes) מובנות, שנמסרות
לסוכני Y-121 (אימייל), Y-122 (SMS), ו-Y-123 (WhatsApp) לצורך מסירה.

**EN:** Cross-org automated follow-up engine that drives rules-based
cadences after business events — sales (opportunity-created,
quote-sent, demo-scheduled, lead-stuck), support (support-ticket-open,
customer-silent-90d) and AR (invoice-due-soon, invoice-overdue). The
engine NEVER sends messages itself. It emits structured "envelopes"
that are handed off to Y-121 (email), Y-122 (SMS), and Y-123 (WhatsApp)
for actual delivery.

Deterministic: given the same cadence definitions, enrollments, tick
timestamps, and condition evaluations, it always emits the same set
of envelopes. All tests run without network I/O.

---

## 2. Public API — `class FollowupEngine`

| Method | Purpose |
|---|---|
| `new FollowupEngine({ clock?, defaultLocale?, onEnvelope? })` | Construct. Inject a deterministic clock for tests, and an optional hook that fires per emitted envelope. |
| `defineCadence({ id, name_he, name_en, trigger, steps })` | Register (or upgrade) a cadence. Validates trigger and every step. Prior revision is preserved in `_revisions`. |
| `enrollEntity(entityId, cadenceId, context?)` | Start a cadence for an entity. Blocked if the entity has been emergency-stopped. |
| `processTick(now?)` | Walk all active enrollments, emit due envelopes, skip condition-gated steps, auto-resume paused enrollments whose window expired, auto-complete when the final step fires. |
| `skipStep(enrollmentId, stepIndex, reason)` | Manual skip. Appends to the skip ledger and fast-forwards the step pointer. Never deletes the skipped step. |
| `completeEnrollment(enrollmentId, outcome)` | Freeze the enrollment with one of: `responded`, `converted`, `dropped-out`, `escalated`. Idempotent — a second call is logged but ignored. |
| `pauseEnrollment(enrollmentId, until)` | Temporary hold. Accepts ISO string, Date, or epoch-ms. |
| `resumeEnrollment(enrollmentId)` | Manual resume (also happens automatically in `processTick`). |
| `emergencyStop(entityId, reason?)` | Halts every active cadence for an entity (e.g. do-not-contact request) AND blocks future enrollments. |
| `recordResponse(enrollmentId, kind, meta?)` | Record `replied` / `opened` / `clicked` / `unsubscribed` so downstream condition checks see the new state. |
| `effectiveness({ cadenceId, period? })` | Response rate, conversion rate, unsub rate, per cadence, optionally scoped to a period. |
| `listActive({ trigger?, cadenceId? })` | Enumerate active + paused enrollments, filterable by trigger or cadence. |
| `history(entityId)` | Full append-only trail across every enrollment the entity has been through. |
| `conditionEvaluator(condition, entity)` | Pure evaluation of a condition string against an entity snapshot. |
| `getCadence(id)` / `getEnrollment(id)` / `getEnvelopes(filter)` / `getLog()` | Introspection helpers — always return copies / frozen values, never internal state. |
| `isEmergencyStopped(entityId)` | Quick flag check. |

---

## 3. Trigger Catalog (קטלוג טריגרים)

| ID | HE Label | EN Label | Typical use |
|---|---|---|---|
| `opportunity-created` | הזדמנות מכירה נפתחה | Opportunity created | Welcome drip, qualification outreach |
| `quote-sent` | הצעת מחיר נשלחה | Quote sent | 3-day / 7-day / 14-day nudge cadence |
| `demo-scheduled` | הדגמה נקבעה | Demo scheduled | Pre-demo reminder, post-demo recap |
| `invoice-due-soon` | חשבונית לקראת פרעון | Invoice due soon | T-7 / T-3 / T-1 payment reminders |
| `invoice-overdue` | חשבונית באיחור | Invoice overdue | Escalating AR sequence |
| `support-ticket-open` | קריאת שירות פתוחה | Support ticket open | SLA-aware check-ins, CSAT request |
| `customer-silent-90d` | לקוח שקט 90 יום | Customer silent 90 days | Re-activation, at-risk outreach |
| `lead-stuck` | ליד תקוע | Lead stuck | Sales-stage unblock, re-assign signal |

All 8 triggers are covered by the immutable `TRIGGERS` export and the
bilingual `TRIGGER_LABELS` map.

---

## 4. Cadence Anatomy (אנטומיה של Cadence)

```js
engine.defineCadence({
  id: 'quote-followup',
  name_he: 'מעקב הצעת מחיר',
  name_en: 'Quote follow-up',
  trigger: 'quote-sent',
  steps: [
    { offsetDays: 0,  channel: 'email',    template: 'quote-thank-you',
      subject_he: 'תודה על ההתעניינות', subject_en: 'Thank you' },
    { offsetDays: 3,  channel: 'email',    template: 'quote-nudge-3d',
      condition: 'not-replied' },
    { offsetDays: 7,  channel: 'whatsapp', template: 'quote-nudge-7d',
      condition: 'not-replied' },
    { offsetDays: 14, channel: 'task',     template: 'quote-sales-call',
      condition: 'not-replied' }
  ]
});
```

**Step fields**

| Field | Required | Description |
|---|---|---|
| `offsetDays` | yes | Days after enrollment when this step becomes due. Finite number; may be 0. |
| `channel`    | yes | One of `email`, `sms`, `whatsapp`, `task`. |
| `template`   | yes | Template id resolved by the downstream delivery agent. |
| `condition`  | no  | Gate expression. If false at tick time the step is auto-skipped. |
| `subject_he` / `subject_en` | no | Optional per-step subject lines carried on the envelope. |

### 4.1 Envelope shape (what the engine emits)

```
{
  id:              'env_<base36ts>_<hex>',
  enrollmentId:    'enr_...',
  entityId:        'opp-42',
  cadenceId:       'quote-followup',
  cadenceName_he:  'מעקב הצעת מחיר',
  cadenceName_en:  'Quote follow-up',
  trigger:         'quote-sent',
  stepIndex:       1,
  channel:         'email',
  template:        'quote-nudge-3d',
  subject_he:      null,
  subject_en:      null,
  context:         { amount: 5000, ... },
  emittedAt:       '2026-04-14T08:00:00.000Z',
  delivery:        'Y-121:email-templates'   // routing hint
}
```

Envelopes are **frozen** (`Object.freeze`) and persisted in an
append-only `_envelopes` array. They are never pruned.

**Delivery routing hints**

| channel | delivery | Owning agent |
|---|---|---|
| `email`    | `Y-121:email-templates` | Y-121 |
| `sms`      | `Y-122:sms-gateway`     | Y-122 |
| `whatsapp` | `Y-123:whatsapp`        | Y-123 |
| `task`     | `internal:task-queue`   | internal workflow |

---

## 5. Condition Grammar (דקדוק תנאים)

Condition strings are evaluated against a snapshot of the enrollment's
`context` + `_flags` map.

| Operator | Semantic | Example |
|---|---|---|
| `replied` | `flags.replied === true` | `replied` |
| `not-replied` | `flags.replied !== true` | `not-replied` |
| `opened` | `flags.opened === true` | `opened` |
| `not-opened` | `flags.opened !== true` | `not-opened` |
| `clicked` | `flags.clicked === true` | `clicked` |
| `not-clicked` | `flags.clicked !== true` | `not-clicked` |
| `amount-gt:<n>` | `entity.amount > n` | `amount-gt:50000` |
| `amount-lt:<n>` | `entity.amount < n` | `amount-lt:50000` |

`conditionEvaluator(condition, entity)` is exposed publicly so
downstream code can pre-validate conditions without enrolling. An
unknown operator evaluates to `false` (fail-closed — safer than
fail-open for compliance).

---

## 6. Effectiveness Metrics (מדדי אפקטיביות)

`effectiveness({ cadenceId, period })` returns:

| Metric | Formula | HE |
|---|---|---|
| `enrolled` | count of enrollments in period | מספר נרשמים |
| `completed` | count with `state='completed'` | הושלמו |
| `sent` | total envelopes emitted across all enrollments | נשלחו |
| `responded` | enrollments with `flags.replied` | הגיבו |
| `converted` | enrollments with `outcome='converted'` | הומרו |
| `unsub` | enrollments with `flags.unsubscribed` | הסירו |
| `responseRate` | `responded / enrolled` | אחוז תגובה |
| `conversionRate` | `converted / enrolled` | אחוז המרה |
| `unsubRate` | `unsub / enrolled` | אחוז הסרה |

Period bounds accept ISO strings, Date objects, or epoch-ms. Either
bound may be omitted.

Zero-division is protected: when `enrolled === 0`, all three rates
return `0`. All rates are rounded to 4 decimal places.

---

## 7. Lifecycle & State Machine

```
                      ┌──────────────┐
        enrollEntity  │    ACTIVE    │◄─────── resumeEnrollment
   ───────────────────►              │◄─── auto-resume (processTick)
                      └──┬───┬────┬──┘
                         │   │    │
           pauseEnrollment│   │    │ completeEnrollment / final step
                         │   │    ▼
                         │   │  ┌──────────────┐
                         │   │  │  COMPLETED   │  (terminal, frozen)
                         │   │  └──────────────┘
                         │   │
                         ▼   ▼
                  ┌──────────────┐
                  │    PAUSED    │
                  └──────────────┘
                         │
                         │ emergencyStop
                         ▼
                  ┌──────────────┐
                  │   STOPPED    │  (terminal — emergencyStop marker)
                  └──────────────┘
```

- **ACTIVE:** eligible for `processTick()` emissions.
- **PAUSED:** held until `pausedUntilMs`. Auto-resumes inside the next
  tick after the window passes. Manual `resumeEnrollment()` works too.
- **COMPLETED:** terminal. `outcome ∈ {responded, converted, dropped-out, escalated}`.
- **STOPPED:** terminal. Set by `emergencyStop()` when the owning
  entity invokes do-not-contact or similar. The enrollment record is
  retained (לא מוחקים) — only its state flips.

---

## 8. Append-Only Audit Trail

Every write appends to **two** logs:

1. **Per-enrollment `history[]`** — enrolled, step-emitted, step-skipped
   (auto + manual), response, paused, auto-resumed, completed,
   emergency-stopped, complete-ignored.
2. **Engine-global `_log[]`** — cadence-defined, enrolled, tick,
   enrollment-completed, enrollment-paused, enrollment-resumed,
   step-skipped-manual, response, emergency-stop, enroll-blocked.

Both arrays are strictly append-only and each entry is frozen on
insert. The `history(entityId)` API aggregates all per-enrollment
history for an entity and sorts by sequence number.

---

## 9. Integration Contract with Y-121 / Y-122 / Y-123

The engine does **not** import any of Y-121/122/123 — it produces
envelopes only. A thin delivery shim (to be added by the wiring agent)
should:

```js
engine.options.onEnvelope = (envelope) => {
  switch (envelope.channel) {
    case 'email':    y121.enqueue(envelope); break;
    case 'sms':      y122.enqueue(envelope); break;
    case 'whatsapp': y123.enqueue(envelope); break;
    case 'task':     taskQueue.push(envelope); break;
  }
};
```

When a downstream agent emits a callback (delivered, opened, clicked,
replied, unsubscribed), it calls `engine.recordResponse(enrollmentId,
kind)`. This flips the flag so the next tick's condition gates see
the updated state.

---

## 10. Test Matrix — 26 tests, all pass

| # | Test | Area |
|---|---|---|
| 01 | constants exports — triggers, channels, outcomes, conditions | exports |
| 02 | defineCadence rejects unknown trigger | validation |
| 03 | defineCadence validates every step | validation |
| 04 | defineCadence upgrade stores prior revision (לא מוחקים) | upgrade-in-place |
| 05 | enrollEntity rejects unknown cadence | validation |
| 06 | enrollEntity happy path creates active enrollment | enrollment |
| 07 | processTick emits nothing when no step is due | tick gating |
| 08 | processTick emits envelope when offset reached | tick emission |
| 09 | processTick advances through multiple due steps (batch catchup) | tick batch |
| 10 | condition not-replied SKIPS when entity has replied | conditional skip |
| 11 | condition not-replied RUNS when no reply registered | conditional run |
| 12 | amount-gt and amount-lt conditions gate steps | numeric conditions |
| 13 | skipStep appends to skip ledger and advances pointer | append-only skip |
| 14 | pauseEnrollment holds emissions until the unpause time | pause |
| 15 | pauseEnrollment auto-resumes after the pause window | auto-resume |
| 16 | completeEnrollment sets outcome and freezes state | completion |
| 17 | completeEnrollment rejects invalid outcome | validation |
| 18 | emergencyStop halts every active cadence for the entity | emergency stop |
| 19 | emergencyStop blocks new enrollments for the same entity | emergency stop |
| 20 | effectiveness computes response / conversion / unsub rates | metrics |
| 21 | listActive filters by trigger and cadenceId | query |
| 22 | history() returns full append-only trail (לא מוחקים) | audit |
| 23 | envelope includes bilingual labels and Y-agent routing hint | envelope shape |
| 24 | recordResponse flips flags for condition evaluation | flag plumbing |
| 25 | getEnvelopes filter by channel | envelope query |
| 26 | processTick auto-completes enrollment after final step | auto-complete |

```
ℹ tests 26
ℹ pass  26
ℹ fail  0
ℹ duration_ms ~110
```

---

## 11. Hebrew Glossary (מונחון דו-לשוני)

| HE | Translit | EN |
|---|---|---|
| מעקב אוטומטי | ma'akav otomati | Automated follow-up |
| רצף תקשורת | retzef tikshoret | Cadence |
| טריגר | triger | Trigger |
| הרשמה | harshama | Enrollment |
| צעד | tza'ad | Step |
| תבנית | tavnit | Template |
| ערוץ | arutz | Channel |
| מעטפת | ma'atefet | Envelope |
| תנאי | tnai | Condition |
| דילוג | dilug | Skip |
| השהיה | hash'haya | Pause |
| חידוש | chidush | Resume |
| השלמה | hashlama | Completion |
| תוצאה | totza'a | Outcome |
| עצירת חירום | atzirat cherum | Emergency stop |
| אל-תקשרו | al-tikshru | Do-not-contact |
| שיעור תגובה | shi'ur teguva | Response rate |
| שיעור המרה | shi'ur hamara | Conversion rate |
| שיעור הסרה | shi'ur hasara | Unsub rate |
| יומן ביקורת | yoman bikoret | Audit log |
| הוספה בלבד | hosafa bilvad | Append-only |
| הזדמנות | hizdamnut | Opportunity |
| הצעת מחיר | hatza'at mechir | Quote |
| הדגמה | hadgama | Demo |
| חשבונית | cheshbonit | Invoice |
| פרעון | pira'on | Due / settlement |
| איחור | ichur | Overdue |
| קריאת שירות | kri'at sherut | Support ticket |
| ליד תקוע | lead taku'a | Stuck lead |
| לקוח שקט | lakoach shaket | Silent customer |

---

## 12. RTL / Bilingual Notes

- Every cadence has both `name_he` and `name_en`; passing only one is
  allowed and the missing one is mirrored.
- Every step **may** carry both `subject_he` and `subject_en`; the
  envelope propagates them verbatim so Y-121 can pick the right one
  at send-time according to the recipient locale.
- All user-facing labels in the trigger catalog are bilingual via
  `TRIGGER_LABELS[trigger]`.
- All error codes are ASCII enum strings (`INVALID_OUTCOME`,
  `UNKNOWN_ENROLLMENT`, etc.) and are never user-facing; translation
  belongs in the UI layer.

---

## 13. Compliance Checklist (לא מוחקים רק משדרגים ומגדלים)

- [x] No `Map.delete` / `Array.splice` anywhere in the source.
- [x] `defineCadence` upgrade preserves the prior version under
      `_revisions` (test #04).
- [x] `skipStep` appends to `skips[]` — never overwrites (test #13).
- [x] `completeEnrollment` is idempotent, logs the ignored call, and
      retains the original outcome (test #16).
- [x] `emergencyStop` flips state but keeps every enrollment record
      (test #18) — `history(entityId)` still returns its full trail.
- [x] `recordResponse` only writes flags to `true`, never false.
- [x] `_envelopes` is never pruned.
- [x] Both `_log` and per-enrollment `history` are append-only;
      entries are frozen on insert (test #23 asserts frozen envelopes).

---

## 14. How to run

```bash
cd onyx-procurement
node --test test/comms/followup-engine.test.js
```

Expected output: `tests 26 / pass 26 / fail 0`.

---

## 15. Files Delivered

- `onyx-procurement/src/comms/followup-engine.js` — engine (zero-dep)
- `onyx-procurement/test/comms/followup-engine.test.js` — 26 tests
- `_qa-reports/AG-Y129-followup-engine.md` — this report

---

*Agent Y-129 — April 2026 — Techno-Kol Uzi mega-ERP*
