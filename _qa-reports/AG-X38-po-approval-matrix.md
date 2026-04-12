# AG-X38 — PO Approval Matrix / מטריצת אישור הזמנות רכש

- **Agent**: X-38
- **Swarm**: 3C
- **Owner**: Kobi (Techno-Kol Uzi)
- **Date**: 2026-04-11
- **Scope**: Multi-level, multi-dimensional approval routing for Purchase Orders
- **Status**: GREEN — 33/33 tests passing (25+ required)
- **Dependencies**: ZERO (Node 20+ built-ins only: `node:crypto`)
- **Language**: Hebrew + English bilingual labels

---

## 1. Deliverables

| # | Path | Purpose |
|---|---|---|
| 1 | `onyx-procurement/src/po/approval-matrix.js` | Core module — pure evaluator + stateful system factory |
| 2 | `test/payroll/approval-matrix.test.js` | Zero-dep test harness (33 cases) |
| 3 | `_qa-reports/AG-X38-po-approval-matrix.md` | This report |

**Run the suite:**
```
node test/payroll/approval-matrix.test.js
```

---

## 2. Matrix Dimensions

| Dimension | Values |
|---|---|
| Amount (₪) | `0-1000` auto, `1001-5000` low, `5001-25000` medium, `25001-100000` high, `100001+` very_high |
| Category | `routine`, `strategic`, `capex` |
| Department | any (resolved via `department_manager_of(dept)`) |
| Vendor risk tier | `A`, `B`, `C`, `D` |
| Emergency flag | `true` / `false` |

---

## 3. Default Approval Flow

| Bracket | Default chain |
|---|---|
| `≤ ₪1,000` | auto-approved (no approver) |
| `₪1,001 – 5,000` | manager |
| `₪5,001 – 25,000` | manager → department head |
| `₪25,001 – 100,000` | manager → dept head → CFO |
| `₪100,001 +` | manager → dept head → CFO → CEO (Kobi) |

**Rule overlays:**
- **R3** — `capex` with `amount > ₪50,000` adds a `board review` step.
- **R3a** — all capex PO are tagged even if sub-threshold.
- **R4** — `strategic` category on the medium bracket promotes CFO.
- **R5** — vendor risk tier **D** blocks submission entirely (`E_BLOCKED`).
- **R6** — vendor risk tier **C** adds CFO review.
- **R7** — an active substitute (vacation coverage) replaces the original.
- **R8** — emergency flag flattens the chain into a parallel group with a
  48h retroactive ratification deadline.

---

## 4. Features implemented (spec mapping)

| # | Feature | Module symbol |
|---|---|---|
| 1 | Dynamic routing based on context | `evaluatePO(po, context)` |
| 2 | Parallel and sequential approvers | `plan.flow_type`, `plan.parallel_groups` |
| 3 | Substitute approver (vacation coverage) | `context.substitutes` + rule R7 |
| 4 | Delegation with audit | `delegate(from,to,fromDate,toDate)` |
| 5 | Escalation on timeout | `escalate()` + `tick()` |
| 6 | Rejection with reason (required) | `approve(..., 'reject', reason)` |
| 7 | Amendment workflow | `amend(poId, changes)` |
| 8 | Budget check integration (X-27) | `deps.budget.checkBudget(po)` |
| 9 | Vendor compliance check | `deps.vendor.getStatus(vendorId)` |
| 10 | Duplicate detection | `deps.dupDetector(po, windowDays)` |

---

## 5. Integration hooks

All hooks are dependency-injected into `createApprovalSystem(deps)`:

| Hook | Contract | Integrated agent |
|---|---|---|
| `notifier(event)` | fire-and-forget | X-16 Notification Center |
| `audit(entry)` | fire-and-forget | X-98 Audit Trail UI |
| `rbac.userHasRole(uid, role)` | boolean | Agent 97 RBAC |
| `budget.checkBudget(po)` | `{ ok, reason?, reason_he? }` | Agent X-27 Budget |
| `vendor.getStatus(vendorId)` | `{ active, approved, debt, tier }` | Vendor Compliance |
| `dupDetector(po, days)` | `{ duplicate, of? }` | X-02 Duplicate detection |
| `clock()` | ms timestamp | deterministic test clock |

The default singleton exported at module scope (`submitForApproval`,
`approve`, etc.) is created lazily with no integrations — production
callers should always instantiate via `createApprovalSystem({ ... })`.

---

## 6. Exports (spec-mandated surface)

```js
// Pure evaluator
evaluatePO(po, context) ->
  { required_approvers, parallel_groups, rules_applied, steps,
    flow_type, labels, emergency, retroactive_deadline, blocked? }

// Stateful API (default singleton or system instance)
submitForApproval(poOrId, opts?)        -> request_id
approve(requestId, userId, decision, comment, opts?) -> next_step descriptor
getPendingApprovals(userId)             -> [{ request_id, po_id, ... }]
delegate(fromUserId, toUserId, fromDate, toDate) -> delegation_id
escalate(requestId, reason)             -> void
getHistory(poId)                        -> entry[]

// System instance helpers
createApprovalSystem(deps)              -> isolated system
system.tick()                           -> ids of newly-expired requests
system.amend(poId, changes, opts)       -> { rerouted, request_id }
```

Constants exported: `BRACKET`, `CATEGORY`, `RISK_TIER`, `REQUEST_STATUS`,
`DECISION`, `ROLE`, `LABELS`, `EMERGENCY_RATIFY_MS`,
`DEFAULT_STEP_TIMEOUT_MS`, `CAPEX_BOARD_THRESHOLD`.

---

## 7. Error codes

| Code | When |
|---|---|
| `E_INVALID_INPUT` | missing/invalid argument, empty reject reason, self delegation, inverted window |
| `E_INVALID_DECISION` | `decision` not `approve`/`reject` |
| `E_PO_NOT_FOUND` | `submitForApproval(poId)` / `amend(poId)` with unknown id |
| `E_REQUEST_NOT_FOUND` | `approve` / `escalate` with unknown request id |
| `E_NOT_PENDING` | acting on an already terminal request |
| `E_NOT_ELIGIBLE` | user is not in the current approver group (and not a delegate) |
| `E_BUDGET_EXCEEDED` | hook returned `{ ok:false }` (overridden for emergency) |
| `E_VENDOR_COMPLIANCE` | vendor inactive, unapproved, or has debt |
| `E_DUPLICATE_PO` | dup detector flagged the PO |
| `E_BLOCKED` | vendor tier D or rule-blocked plan |

---

## 8. Test coverage (33 cases)

| # | Test | Target |
|---|---|---|
| 01 | `resolveBracket` boundary classification | Bracket math (0, 1k, 5k, 25k, 100k, 1M) |
| 02 | `evaluatePO` auto bracket returns empty chain | R1 |
| 03 | low bracket needs manager only | R2b |
| 04 | medium bracket → manager + dept head | R2c |
| 05 | high bracket → mgr + head + CFO | R2d |
| 06 | very high bracket full chain incl. Kobi | R2e |
| 07 | capex > ₪50k adds board review | R3 |
| 08 | capex ≤ ₪50k tagged but no board | R3a |
| 09 | strategic medium promotes CFO | R4 |
| 10 | vendor risk tier D blocks | R5 |
| 11 | vendor risk tier C adds CFO | R6 |
| 12 | emergency → parallel + retroactive deadline | R8 |
| 13 | active substitute replaces original | R7 |
| 14 | expired substitute NOT applied | R7 negative |
| 15 | `department_manager_of` fallback honored | context DI |
| 16 | auto PO reaches APPROVED immediately | submit |
| 17 | sequential notifies only first step | submit+notifier |
| 18 | budget check failure → `E_BUDGET_EXCEEDED` | budget hook |
| 19 | vendor compliance failure → `E_VENDOR_COMPLIANCE` | vendor hook |
| 20 | duplicate detector → `E_DUPLICATE_PO` | dup hook |
| 21 | sequential chain walks to APPROVED | approve happy path |
| 22 | rejection terminal + further approvals refused | reject |
| 23 | rejection without reason is refused | reject guard |
| 24 | wrong user → `E_NOT_ELIGIBLE` | RBAC |
| 25 | delegation lets delegate act on behalf of original | delegation |
| 26 | `getPendingApprovals` filters by eligibility | inbox |
| 27 | escalate → ESCALATED + history preserved | escalate |
| 28 | tick auto-escalates expired steps | timeout |
| 29 | emergency retroactive deadline expires unratified PO | 48h window |
| 30 | amend re-routes when amount increases >10% | amendment |
| 31 | `getHistory` returns ordered full audit trail | audit |
| 32 | delegate rejects invalid windows + self | delegate guards |
| 33 | notifier + audit hooks fire with expected payloads | X-16 + X-98 |

---

## 9. Test results

```
approval-matrix.test.js — Techno-Kol ERP / Agent X-38
----------------------------------------------------
  ok   - 01 resolveBracket — boundary classification
  ok   - 02 evaluatePO — auto bracket returns empty chain
  ok   - 03 evaluatePO — low bracket needs manager only
  ok   - 04 evaluatePO — medium bracket needs manager + dept head
  ok   - 05 evaluatePO — high bracket needs mgr + head + CFO
  ok   - 06 evaluatePO — very high bracket full chain includes CEO Kobi
  ok   - 07 evaluatePO — capex > ₪50k adds board review
  ok   - 08 evaluatePO — capex ≤ ₪50k tagged but no board
  ok   - 09 evaluatePO — strategic medium promotes CFO
  ok   - 10 evaluatePO — vendor risk tier D blocks
  ok   - 11 evaluatePO — vendor risk tier C adds CFO
  ok   - 12 evaluatePO — emergency → parallel + retroactive deadline
  ok   - 13 evaluatePO — active substitute replaces original approver
  ok   - 14 evaluatePO — expired substitute NOT applied
  ok   - 15 evaluatePO — department_manager_of fallback honored
  ok   - 16 submitForApproval — auto PO reaches APPROVED immediately
  ok   - 17 submitForApproval — sequential notifies only first step
  ok   - 18 submitForApproval — budget rejection
  ok   - 19 submitForApproval — vendor compliance rejection
  ok   - 20 submitForApproval — duplicate detector rejection
  ok   - 21 approve — sequential chain walks to APPROVED
  ok   - 22 approve — rejection terminal, further approvals refused
  ok   - 23 approve — rejection without reason is refused
  ok   - 24 approve — wrong user is refused with E_NOT_ELIGIBLE
  ok   - 25 approve — delegation lets delegate act on behalf of original
  ok   - 26 getPendingApprovals — filters by eligibility
  ok   - 27 escalate — moves to ESCALATED, history preserved
  ok   - 28 tick — auto-escalates expired steps
  ok   - 29 tick — emergency retroactive deadline expires unratified PO
  ok   - 30 amend — re-routes when amount increases >10%
  ok   - 31 getHistory — returns full ordered audit trail
  ok   - 32 delegate — rejects invalid windows and self-delegation
  ok   - 33 integration — notifier + audit hooks fire with payloads
----------------------------------------------------
Total: 33  Passed: 33  Failed: 0
```

---

## 10. Compliance checklist

- [x] Zero external dependencies (Node 20+ built-ins only)
- [x] Hebrew + English bilingual labels (`LABELS` / `labelOf(key, lang)`)
- [x] Never deletes PO data — amendments produce a NEW request with full
      history, original PO record preserved under `getPO(poId)`.
- [x] Deterministic via injected `clock()` — tests run under a virtual clock.
- [x] Audit trail captures every state transition (`getHistory(poId)`).
- [x] RBAC / 97 integration point via `deps.rbac.userHasRole`.
- [x] X-16 Notification Center integration via `deps.notifier`.
- [x] X-27 Budget check integration via `deps.budget.checkBudget`.
- [x] X-98 Audit trail integration via `deps.audit`.
- [x] X-02 Duplicate detector integration via `deps.dupDetector`.
- [x] Emergency flow supports a 48h retroactive ratification with deadline
      expiration handled by `tick()` — never silently loses data.
- [x] All public exports specified in the task present and exercised by tests.

---

## 11. Open items / future enhancements

1. Persistence adapter — current instance uses `Map`-backed stores; a
   Postgres/SQLite adapter could be plugged via a `db` hook mirroring the
   workflow engine pattern.
2. SLA reporting — report on request-to-approval latency grouped by
   department/category (data is already captured in history entries).
3. Scheduled escalation cron — `tick()` should be called by a scheduler
   (X-84 cron agent) on a 5-minute cadence.
4. Approval UI — thin React view over `getPendingApprovals(userId)`.
5. Multi-currency — currently ILS-only; add FX module (X-?) integration.

---

**END — AG-X38 report**
