# AG-Y109 — Generic Approval Workflow Engine — QA Report

**Agent**: Y-109 Generic Approval Engine
**Module**: `onyx-procurement/src/approvals/approval-engine.js`
**Tests**:  `onyx-procurement/test/approvals/approval-engine.test.js`
**Swarm**: Process Automation — complements X-15 (workflow engine) and X-38 (PO approval matrix)
**ERP**: Techno-Kol Uzi mega-ERP
**Rule**: לא מוחקים רק משדרגים ומגדלים — append-only, upgrade-and-grow
**Status**: GREEN — 33/33 tests pass
**Zero-dependency**: YES (Node 20+ built-ins only — `crypto`, `events`)
**Bilingual**: YES (Hebrew + English on every flow, step, history entry, glossary)
**Date**: 2026-04-11

---

## 1. Scope

A generic, entity-agnostic approval workflow engine that complements
(never replaces) the two existing approval systems:

- **X-15 workflow engine** (`src/workflow/engine.js`) — declarative, event-driven
  workflow runner for end-to-end business processes (invoice -> post -> pay).
- **X-38 PO approval matrix** — purchase-order-specific, fixed tier matrix.

Y-109 sits between them: a reusable, flow-defined approval engine that any
entity can plug into without inheriting PO-specific logic and without running
a full workflow instance. It answers the recurring request _"I need a 2-step
approval on a `contract` / `timecard` / `leave` / `new-vendor` — what do I
reach for?"_

Supported entities (10): `invoice`, `po`, `expense`, `contract`, `timecard`,
`leave`, `change-order`, `new-vendor`, `new-customer`, `custom`.

All state is **append-only**: decisions, skips, escalations and condition
attachments are recorded as history entries. Nothing is deleted; step states
accumulate and can be inspected at any time via `historyView`.

---

## 2. Public API surface

| Method | Purpose |
|---|---|
| `defineFlow({id, name_he, name_en, entity, steps, parallel})` | Register a reusable flow definition |
| `startRequest({flowId, entity, initiator, payload})` | Begin an approval request |
| `routeToApprovers(requestId)` | Determine who is next (sequential / parallel) |
| `submitDecision({requestId, approver, decision, comments, conditions})` | Record a vote |
| `aggregate(requestId)` | Combine parallel / multi-approver decisions |
| `escalate(requestId, reason)` | Manual escalation |
| `checkTimeouts(atTime)` | Auto-escalate any expired steps |
| `delegateAuthority({fromUser, toUser, dateRange, scope})` | Out-of-office delegation |
| `amountBasedRouting({entity, amount})` | Tier-based routing chain |
| `conditionalApproval({requestId, conditions})` | Attach conditions to an approval |
| `historyView(requestId)` | Full bilingual audit trail |
| `metrics({flowId, period})` | Avg time, bottleneck step, rejection rate |
| `bulkApproval(requestIds, approver)` | Batch approve routine items |
| `mobileApprovalToken({requestId, ttlMs, approver})` | HMAC-signed mobile link |
| `verifyMobileToken(token)` | Verify an incoming mobile token |

---

## 3. Flow definition anatomy

```js
eng.defineFlow({
  id: 'inv-standard',
  name_he: 'אישור חשבונית סטנדרטי',
  name_en: 'Standard invoice approval',
  entity: 'invoice',
  parallel: false,               // sequential by default
  steps: [
    {
      id: 'manager',
      name_he: 'מנהל צוות',
      name_en: 'Team manager',
      type: 'one-of',            // one-of | all-of | majority
      approvers: ['alice@co.il', 'bob@co.il'],
      condition: true,           // or 'ctx.payload.amount > 10000'
      timeout: 30 * 60 * 1000,   // ms — auto-escalates after 30m
      escalation: 'role:director',
    },
    {
      id: 'director',
      type: 'one-of',
      approvers: ['carol@co.il'],
      condition: 'ctx.payload.amount > 10000',  // conditional step
      timeout: 60 * 60 * 1000,
    },
  ],
});
```

### Step.type semantics

| Type | Rule |
|---|---|
| `one-of` | First `approve` closes the step. First `reject` kills the request. |
| `all-of` | Every approver must `approve`. Any `reject` kills the request. |
| `majority` | `> floor(n/2)` approvers must `approve`. Any `reject` kills the request. |

### Parallel vs sequential

- **Sequential (default)**: step 0 -> step 1 -> ... Each step must finish
  (approved or skipped) before the next activates.
- **Parallel**: all steps are active from the start; aggregation completes when
  every active step is `approved`. Conditional-false steps auto-count as done.

---

## 4. Routing types

### 4.1 Flow-defined routing
`routeToApprovers(requestId)` returns the list of email/user IDs for the
active step(s), replacing any original approver with their active delegate.
Sequential flows return only the current step; parallel flows return the
union across all unfinished steps.

### 4.2 Amount-based routing (`amountBasedRouting`)
Returns a tier chain based on ILS amount, independent of any flow. Useful
as a side-channel or fallback for escalation targets.

| Entity | Tiers (ILS) | Final approvers |
|---|---|---|
| `invoice` | 1k / 10k / 50k / 250k / ∞ | team-lead, manager, director, vp-finance, ceo |
| `po` | 5k / 25k / 100k / 500k / ∞ | team-lead, manager, director, vp-procurement, ceo |
| `expense` | 500 / 2.5k / 10k / ∞ | team-lead, manager, director, cfo |
| `contract` | 10k / 100k / 1M / ∞ | manager, director, vp-legal, ceo |
| `change-order` | 2.5k / 25k / 250k / ∞ | project-manager, director, vp-operations, ceo |
| `timecard` / `leave` | presence | manager |
| `new-vendor` | presence | procurement-manager |
| `new-customer` | presence | sales-manager |
| `custom` | presence | manager |

Tiers are overridable at engine construction (`new ApprovalEngine({ tiers })`).

### 4.3 Delegation routing
`delegateAuthority({fromUser, toUser, dateRange, scope})` installs a time-
bounded delegation record. `routeToApprovers` transparently swaps the
delegated target when the current time is inside the window AND the scope
allows the entity+amount. Scope shape: `{ entities: ['*'|'invoice'|...], maxAmount }`.

### 4.4 Conditional routing
`step.condition` is either `true`, a predicate function `(ctx) => bool`, or a
safe expression string. Expressions are parsed with a hand-written recursive-
descent parser — **no `eval`, no `new Function`**. Supported operators:
`&& || !  == != < <= > >=  + - * / %  ( )`. Access to data is restricted to
`ctx.*` dotted paths. Any parse/runtime error returns `false` (fail-closed).

Steps whose condition evaluates false are **skipped** (not deleted): a
`step.skipped` history entry is appended and the request advances.

---

## 5. Aggregation (`aggregate`)

Called automatically after every `submitDecision`. Evaluates each active step
against its type rule:

- `reject` present -> request terminally `rejected`.
- Rule satisfied -> step marked `done + approved`.
- Sequential: advance to next step; skip conditional-false steps on the way.
- Parallel: when every (non-skipped) step is `done + approved`, request is
  terminally `approved`.

Aggregate is safe to call multiple times — it's idempotent on closed requests.

---

## 6. Escalation

Two modes:

1. **Manual** — `escalate(requestId, reason)` moves the request to `escalated`
   status and records targets.
2. **Auto on timeout** — `checkTimeouts()` is a cron-friendly sweep that
   escalates any step whose `dueAt` has passed.

Escalation target selection:
- If the step has an explicit `escalation` field, use it.
- Otherwise, compute the next tier up via `_nextTierUp(entity, amount)`.

Every escalation produces an `escalated` history entry with reason + targets.

---

## 7. Conditional approval

`conditionalApproval({requestId, conditions})` attaches a list of free-text
conditions (e.g. _"must deliver within 30 days"_, _"add net-60 terms"_) to
an in-flight request. Stored on `req.conditions`, surfaced in downstream PO
or contract generation. Each condition is stamped with `at` timestamp and
logged as `conditions.attached` in history.

Approvers can also embed conditions inside their own decision:
`submitDecision({..., decision:'approve', conditions:['net-30']})`. These are
tagged with the stepId + approver.

---

## 8. Bulk approval

`bulkApproval(requestIds, approver)` runs `submitDecision({decision:'approve'})`
over a list of routine items (standing orders, small expenses, recurring
timecards). Returns `{approved, skipped, failed}` tallies. Each submission is
independent: a bad ID doesn't block the rest. Emits a single `bulk.completed`
event at the end with aggregate counts.

Typical use: Friday-afternoon manager review of 20 small expenses under 500 ILS.

---

## 9. Mobile approval token

`mobileApprovalToken({requestId, ttlMs, approver})` returns:

```js
{
  token: 'eyJyaWQiOiJyZXFfYWJjIiwiYXAiOiJhbGljZSIsImV4cCI6MTcuLi4ifQ.<hmac>',
  expiresAt: 1712852400000,
  url: '/mobile/approve?t=...',
  requestId: 'req_abc',
}
```

The payload is base64url-encoded JSON `{rid, ap, exp, nonce}` and signed with
HMAC-SHA256 using the engine's `secret` (set at construction). `verifyMobileToken`
validates the signature and expiration, returning `null` on any failure. Tests
cover sign/verify, tampering, and expiry.

Tokens should be relayed via SMS / push / email — never logged server-side.

---

## 10. Metrics

`metrics({flowId, period})` returns:

| Field | Meaning |
|---|---|
| `total` | Number of requests in window |
| `approved` / `rejected` / `pending` | Counts by status |
| `avgDecisionTimeMs` | Mean duration from start to close over closed requests |
| `rejectionRate` | `rejected / total` (4 decimal places) |
| `bottleneckStep` | Step ID with highest average time between first-activation and last-decision |
| `stepAverages` | Full map of `{stepId -> avgMs}` |

Period is `{from, to}` Unix ms, both optional.

---

## 11. Hebrew glossary

| Key | עברית | English |
|---|---|---|
| `approve` | אישור | approve |
| `reject` | דחייה | reject |
| `request-info` | בקשת מידע נוסף | request-info |
| `escalate` | הסלמה | escalate |
| `delegate` | האצלת סמכות | delegate |
| `route` | ניתוב | route |
| `bulk` | אישור מרוכז | bulk-approval |
| `mobile` | אישור נייד | mobile-approval |
| `pending` | ממתין | pending |
| `in-review` | בבדיקה | in-review |
| `approved` | מאושר | approved |
| `rejected` | נדחה | rejected |
| `info-requested` | ממתין למידע | info-requested |
| `escalated` | הוסלם | escalated |
| `cancelled` | בוטל | cancelled |
| `one-of` | מאשר יחיד | one-of |
| `all-of` | כל המאשרים | all-of |
| `majority` | רוב | majority |
| `invoice` | חשבונית | invoice |
| `po` | הזמנת רכש | purchase-order |
| `expense` | הוצאה | expense |
| `contract` | חוזה | contract |
| `timecard` | דוח שעות | timecard |
| `leave` | חופשה | leave |
| `change-order` | הוראת שינוי | change-order |
| `new-vendor` | ספק חדש | new-vendor |
| `new-customer` | לקוח חדש | new-customer |
| `custom` | מותאם אישית | custom |

Every history entry carries both `note.he` and `note.en`, auto-composed from
the step name + action. This lets a single UI surface the same audit trail
for Hebrew and English users without translation lookup at render time.

---

## 12. Test coverage (33 cases, all passing)

| # | Test | Area |
|---|---|---|
| 01 | defineFlow validates required fields | validation |
| 02 | defineFlow registers valid flow | definition |
| 03 | startRequest rejects unknown flow | validation |
| 04 | startRequest creates request in-review | start |
| 05 | routeToApprovers returns current step approvers | routing |
| 06 | one-of step single approval advances | aggregation |
| 07 | conditional step skipped when condition false | conditional |
| 08 | two-step sequential requires director for amount > 10k | sequential |
| 09 | rejection terminates the flow | rejection |
| 10 | parallel all-of requires every approver | parallel/all-of |
| 11 | parallel majority | parallel/majority |
| 12 | parallel with multiple steps all-done -> approved | parallel |
| 13 | delegation routes to delegate during window | delegation |
| 14 | delegation respects entity scope | delegation scope |
| 15 | escalation on timeout | escalation |
| 16 | manual escalate() sets status and returns targets | escalation |
| 17 | amountBasedRouting returns tier chain | amount routing |
| 18 | amountBasedRouting for PO tier | amount routing |
| 19 | conditionalApproval attaches conditions | conditional approval |
| 20 | historyView returns bilingual entries | history |
| 21 | metrics — rejection rate and avg time | metrics |
| 22 | metrics identify bottleneck step | metrics |
| 23 | bulkApproval processes multiple requests | bulk |
| 24 | bulkApproval handles non-existent ids gracefully | bulk |
| 25 | mobileApprovalToken generates and verifies | mobile |
| 26 | mobileApprovalToken rejects tampered token | mobile |
| 27 | mobileApprovalToken expires | mobile |
| 28 | safe evalCondition handles expressions | safety |
| 29 | evalCondition returns false on bad expression | safety |
| 30 | idempotent — same approver cannot vote twice | correctness |
| 31 | request-info decision does not close request | decisions |
| 32 | unauthorized approver is rejected | auth |
| 33 | DEFAULT_TIERS is present for all entities | config |

Run:
```bash
cd onyx-procurement
node --test test/approvals/approval-engine.test.js
```

Output:
```
ℹ tests 33
ℹ pass 33
ℹ fail 0
ℹ duration_ms 122.77
```

---

## 13. Security notes

1. **No `eval`** — condition expressions use a hand-rolled parser with a
   restricted grammar. Fail-closed on any parse/runtime error.
2. **HMAC-signed mobile tokens** — SHA-256 with a per-engine secret; payload
   is read-only (no server trust needed beyond signature verification).
3. **Append-only history** — every decision, skip, escalation and condition
   attachment produces a history entry. The engine exposes no delete method.
4. **Idempotent decisions** — same approver cannot vote twice on the same
   step; the second call returns `{message: 'already voted'}` without
   mutating state.
5. **Authorization check** — `submitDecision` throws when the approver is
   not in the step's approver list AND is not an active delegate of one of
   them. Delegate scope (entities + maxAmount) is enforced on every
   authorization check.

---

## 14. Non-deletion / upgrade-and-grow compliance

This module is purely **additive**:

- `src/workflow/engine.js` (X-15) — untouched.
- PO approval matrix (X-38) — untouched; Y-109 callers can continue using
  X-38 for PO-only flows, or wrap X-38 tiers inside a Y-109 flow definition.
- Flow definitions are reusable and versionable at the caller level; the
  engine does not mutate or replace existing definitions when a new one is
  registered under a different ID.
- Every decision is an append operation; no `delete` / `remove` verbs are
  exposed on the public API.

Future upgrades (pluggable storage, webhook emitters, digital signatures)
will be additive fields on the same class — no breaking API changes to the
13 public methods listed in section 2.

---

## 15. Integration checklist

- [ ] Expose `POST /approvals/flows` route that wraps `defineFlow`.
- [ ] Expose `POST /approvals/requests` route that wraps `startRequest`.
- [ ] Expose `POST /approvals/requests/:id/decisions` for `submitDecision`.
- [ ] Add cron job hitting `checkTimeouts()` every minute.
- [ ] Wire `bulkApproval` into the dashboard "review queue" component.
- [ ] Generate mobile tokens during the notification step (SMS/WhatsApp).
- [ ] Surface `metrics` on the analytics dashboard as a new card.

---

**Agent Y-109 — completed 2026-04-11 — 33/33 GREEN**
