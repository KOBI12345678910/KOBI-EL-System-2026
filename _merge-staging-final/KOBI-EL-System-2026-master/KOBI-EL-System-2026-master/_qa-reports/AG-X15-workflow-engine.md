# AG-X15 — Declarative Workflow Engine
**Agent:** X-15 | **Swarm:** 3 | **Project:** Techno-Kol Uzi mega-ERP
**Date:** 2026-04-11
**Status:** PASS — 30/30 tests green

---

## 1. Scope

A zero-dependency declarative workflow engine for approvals and automations
inside the Techno-Kol mega-ERP. Powered entirely by Node's `node:*` built-ins:
`events`, `crypto`. No external libs (no BPMN engine, no state-machine pkg,
no temporal SDK), no database dependency (swap-in `db` adapter supported,
in-memory fallback included).

Delivered files
- `onyx-procurement/src/workflow/engine.js` — the engine (1,126 LOC)
- `onyx-procurement/test/payroll/workflow-engine.test.js` — 30 tests (558 LOC)
- `_qa-reports/AG-X15-workflow-engine.md` — this report

RULES respected
- Zero dependencies (only `node:events`, `node:crypto`)
- Hebrew bilingual labels on every built-in workflow (`name` contains both)
- Never deletes — instances stay in the store; `cancel()` transitions but
  keeps history; `deleteInstance` is only on the in-memory adapter and is
  never called by engine code
- Real code, fully exercised by 30 unit tests

---

## 2. Public API

```js
const {
  createEngine,       // (db?) → WorkflowEngine
  WorkflowEngine,     // class
  BUILT_IN_WORKFLOWS, // 5 definitions
  STATUS,             // enum
  STEP_STATUS,        // enum
  DECISION,           // { APPROVE, REJECT, DELEGATE }
  evaluateCondition,  // safe expr evaluator
  parseExpr,          // AST parser (internal, exported for tests)
  createMemoryDb,     // in-memory store factory
} = require('./src/workflow/engine.js');
```

Engine methods:

| Method | Purpose |
|---|---|
| `defineWorkflow(def)` | Register a definition (validated + frozen) |
| `getWorkflow(id)` | Look up a definition |
| `listWorkflows()` | Array of all definitions |
| `registerAction(name, fn)` | Register an action handler |
| `trigger(workflowId, ctx)` | Start a new instance, returns `instanceId` |
| `emitEvent(name, ctx)` | Event-driven trigger; runs every workflow whose `trigger.name` matches |
| `approve(instanceId, stepId, userId, decision, comment?)` | Decide on a waiting approval |
| `getInstance(instanceId)` | Full snapshot + history + stepStates |
| `listInstances(filter?)` | Query instances |
| `listPending(userId)` | All approvals waiting for this user (via role check) |
| `pause(id, reason?)` / `resume(id)` | Suspend / restart |
| `cancel(id, reason)` | Terminate with audit |
| `forceTimeout(id, stepId)` | Manual timeout trigger (also used by the built-in timer handler) |
| `shutdown()` | Clear timers + listeners (tests) |

---

## 3. Workflow definition schema

```js
{
  id: 'invoice-approval',
  name: 'אישור חשבונית ספק / Invoice Approval',
  trigger: { type: 'event', name: 'invoice.created' },
  steps: [
    { id: 'amount-check', type: 'condition',
      if: 'ctx.amount > 5000', then: 'manager-approve', else: 'auto-approve' },
    { id: 'manager-approve', type: 'approval',
      assignee: 'role:manager', timeout_hours: 48,
      escalate_to: 'role:director', next: 'finance-gate' },
    { id: 'finance-approve', type: 'approval',
      assignee: 'role:accountant', when: 'ctx.amount > 50000',
      next: 'invoice-approve-action' },
    { id: 'invoice-approve-action', type: 'action', do: 'invoice.approve',
      next: 'notify' },
    { id: 'notify', type: 'action', do: 'notification.send' },
  ],
}
```

Supported step types:
- **condition** — `if` expression, `then` / `else` branches
- **approval** — `assignee`, `timeout_hours`, `escalate_to`, `next`
- **action** — `do` registered action name, optional `retry: { max, backoff_ms }`
- **parallel** — `branches[]` fan-out + join, `next` after join
- **sequential** — `branches[]` in order, `next` after last
- **delay** — `ms` millisecond wait (uses `setTimeout`)
- **notify** — shorthand for `action` + `notification.send`

Step-level `when: 'ctx.…'` skips the step (not the branch) when false.

---

## 4. Safe expression language

`evaluateCondition(expr, ctx)` runs a **purpose-built parser + interpreter** —
no `eval`, no `new Function`, no `vm`. Grammar:

```
or   → and ('||' and)*
and  → eq  ('&&' eq)*
eq   → cmp (('==' | '!=' | '===' | '!==') cmp)*
cmp  → add (('<' | '<=' | '>' | '>=') add)*
add  → mul (('+' | '-') mul)*
mul  → unary (('*' | '/' | '%') unary)*
unary → ('!' | '-') unary | primary
primary → NUM | STR | BOOL | NULL | '(' or ')' | member
member  → IDENT ('.' IDENT | '[' or ']')*
```

Only reads from `ctx.*`; function calls are a syntax error; runtime errors
return `false`. Expressions with unknown roots or unterminated strings throw
from `parseExpr` (caught in `evaluateCondition`).

Test 22 verifies the no-escape-hatch property: `process.exit(0)` and
`ctx.foo()` both fail to parse / evaluate to `false`.

---

## 5. Features delivered

| # | Feature | Where |
|---|---|---|
| 1 | Event-driven triggers | `emitEvent` + `this.triggers: Map<event, Set<wfId>>` |
| 2 | Parallel steps | `_runParallel` + `parallelMap` + join in `_advance` |
| 2 | Sequential steps | `_runSequential` + `sequentialMap` |
| 3 | Conditional branching | `condition` step type + `when` clauses |
| 4 | Timeouts + escalation | `_runApproval` installs `setTimeout`, `_handleTimeout` reassigns or fails |
| 5 | Retry on failure | `retry: { max, backoff_ms }` in `_runAction` (sync loop + audit entries) |
| 6 | Audit trail | Every lifecycle event → `instance.history[]` + `emit('audit')` |
| 7 | Pause/resume | `STATUS.PAUSED` with `_prevStatus` restore |
| 8 | Cancel | `STATUS.CANCELLED`, approvals cleared, timers freed |
| 9 | Role-based assignment | `role:*`, `user:*`, `group:*` via `ctx.users[userId]` |
| 10 | SLA tracking | `instance.sla.dueAt` = earliest step `dueAt` |

---

## 6. Built-in workflows

| ID | Trigger | Highlights |
|---|---|---|
| `invoice-approval` | `invoice.created` | <5k auto; 5-50k manager; >50k manager + finance; 48h timeout → director |
| `employee-onboarding` | `employee.hired` | parallel create-user + create-payroll + create-101, then HR review |
| `expense-reimbursement` | `expense.submitted` | <1k auto-pay, >1k manager then finance |
| `vendor-onboarding` | `vendor.registered` | KYC with retry, legal review (7d), finance review (3d), activate |
| `payment-release` | `payment.requested` | ≥100k dual-approve (CFO ∥ CEO); else single accountant |

Every one has a Hebrew + English `name`. Test 24 triggers each one to confirm
the definitions parse, validate and run at least their first step.

---

## 7. Test coverage (30 cases)

```
✔ 01. createEngine registers all 5 built-in workflows
✔ 02. defineWorkflow rejects invalid definitions
✔ 03. simple sequential action workflow completes
✔ 04. condition step routes to else-branch on small amount
✔ 05. condition step routes to then-branch on large amount
✔ 06. approve() advances manager-approve then completes
✔ 07. reject decision ends workflow with rejected result
✔ 08. cancel() transitions to cancelled and clears approvals
✔ 09. pause() + resume() restore prior status
✔ 10. action retry succeeds after transient failures
✔ 11. action retry exhausted fails the workflow
✔ 12. parallel step runs all branches and joins
✔ 13. sequential step runs branches in declared order
✔ 14. emitEvent triggers registered workflows
✔ 15. role-based approval rejects unauthorized users
✔ 16. listPending filters by user role via ctx.users
✔ 17. forceTimeout escalates to configured role
✔ 18. forceTimeout without escalate_to fails workflow
✔ 19. audit trail records workflow and step events
✔ 20. SLA dueAt is set from timeout_hours
✔ 21. evaluateCondition supports nested paths & operators
✔ 22. parseExpr has no escape hatch (no eval/new Function)
✔ 23. step.when=false skips the step
✔ 24. every built-in workflow runs at least its first step
✔ 25. trigger with unknown workflow id throws
✔ 26. custom db adapter receives saveInstance calls
✔ 27. invoice-approval over 50k goes manager→finance
✔ 28. approving the same step twice throws
✔ 29. engine emits audit events for listeners
✔ 30. cancel after completion is idempotent

tests 30 | pass 30 | fail 0 | duration_ms ~200
```

Run:
```bash
cd onyx-procurement
node --test test/payroll/workflow-engine.test.js
```

---

## 8. Known limitations & follow-ups

- **Timers are in-process.** `setTimeout` handles are unref'd and cleared on
  `cancel()`/`shutdown()`, but if the Node process dies before a timeout
  fires, the wake-up is lost. For a cross-process / durable engine, wire the
  `db` adapter into the existing `onyx-procurement/src/queue` and run
  `_handleTimeout` from a worker.
- **No visual designer.** Definitions are JSON. A companion UI layer can
  render the `steps[]` as a DAG — the schema is stable enough for a designer.
- **Retries are synchronous** — `backoff_ms` is recorded in audit entries but
  not slept on (keeps the engine deterministic for tests). For real back-off
  delays, wrap the action function or emit a `delay` step between retries.
- **Expression language is intentionally minimal.** No method calls, no
  ternary, no regex. This is a safety feature; do not add an eval-escape.
- **Authorization is pluggable but permissive by default.** If
  `ctx.users` is not supplied, `_canApprove` accepts any user — suitable for
  dev/tests. Production callers must populate `ctx.users[userId].roles` so
  the check becomes binding.

---

## 9. Sign-off

Zero deps confirmed:
```
$ grep -n "require(" onyx-procurement/src/workflow/engine.js
  node:crypto
  node:events
```

All 30 tests pass green on Node 20+. Engine is ready for integration with the
invoice, payroll, HR, procurement and payment modules of the Techno-Kol
mega-ERP.

**Agent X-15 — Swarm 3 — complete.**
