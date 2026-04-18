# DOMAIN — orchestration — Permission Matrix

**Generated:** 2026-04-18
**Scope:** All `/api/orchestration/*` endpoints and `erp-app/src/pages/orchestration/*` surfaces.
**Rule:** Orchestration is a hybrid domain — workflow **execution** surfaces (runs, inbox claim/resolve, notifications) are available to every authenticated user; workflow **definition / trigger** surfaces are admin-only.

## Legend

| symbol | meaning |
|---|---|
| SA  | superadmin |
| A   | admin |
| U   | any authenticated user |
| Own | only the user who owns the row (recipient / assignee) |
| —   | not allowed |

## Matrix — API endpoints

| Endpoint | Method | SA | A | U | Own | Notes |
|---|---|---|---|---|---|---|
| `/api/orchestration/workflows`                        | GET    | ✅ | ✅ | ✅ |     | authMiddleware — read list of definitions |
| `/api/orchestration/workflows/:id`                    | GET    | ✅ | ✅ | ✅ |     | read a definition with steps + triggers |
| `/api/orchestration/workflows`                        | POST   | ✅ | ✅ | — |     | admin: create definition |
| `/api/orchestration/workflows/:id`                    | PATCH  | ✅ | ✅ | — |     | admin: edit definition |
| `/api/orchestration/workflows/:id/trigger`            | POST   | ✅ | ✅ | ✅ |     | any user may start (subject to future role gate per workflow) |
| `/api/orchestration/workflows/:id/steps`              | GET    | ✅ | ✅ | ✅ |     | read step definitions |
| `/api/orchestration/workflows/:id/steps`              | POST   | ✅ | ✅ | — |     | admin: add step |
| `/api/orchestration/workflows/steps/:id`              | PATCH  | ✅ | ✅ | — |     | admin: edit step |
| `/api/orchestration/workflow-runs`                    | GET    | ✅ | ✅ | ✅ |     | read-only list |
| `/api/orchestration/workflow-runs/:id`                | GET    | ✅ | ✅ | ✅ |     | run + step tree + jobs |
| `/api/orchestration/workflow-runs/:id/pause`          | POST   | ✅ | ✅ | ✅ |     | any authenticated user may pause (future: per-workflow ACL) |
| `/api/orchestration/workflow-runs/:id/resume`         | POST   | ✅ | ✅ | ✅ |     | any authenticated user may resume |
| `/api/orchestration/workflow-runs/:id/cancel`         | POST   | ✅ | ✅ | ✅ |     | any authenticated user may cancel |
| `/api/orchestration/workflow-runs/steps/list`         | GET    | ✅ | ✅ | ✅ |     | read step runs (filter by run) |
| `/api/orchestration/workflow-runs/steps/comments`     | GET    | ✅ | ✅ | ✅ |     | read comments |
| `/api/orchestration/workflow-runs/steps/comments`     | POST   | ✅ | ✅ | ✅ |     | any user may comment |
| `/api/orchestration/workflow-triggers`                | GET    | ✅ | ✅ | — |     | admin-only: trigger registry |
| `/api/orchestration/workflow-triggers`                | POST   | ✅ | ✅ | — |     | admin-only |
| `/api/orchestration/workflow-triggers/:id`            | PATCH  | ✅ | ✅ | — |     | admin-only |
| `/api/orchestration/workflow-triggers/:id/enable`     | POST   | ✅ | ✅ | — |     | admin-only enable/disable |
| `/api/orchestration/job-queue`                        | GET    | ✅ | ✅ | ✅ |     | read queue (filter by workflow_run_id for user context) |
| `/api/orchestration/job-queue/:id`                    | GET    | ✅ | ✅ | ✅ |     | read one |
| `/api/orchestration/job-queue`                        | POST   | ✅ | ✅ | — |     | admin: enqueue arbitrary job |
| `/api/orchestration/job-queue/:id/retry`              | POST   | ✅ | ✅ | ✅ |     | any user may retry |
| `/api/orchestration/job-queue/:id/cancel`             | POST   | ✅ | ✅ | ✅ |     | any user may cancel |
| `/api/orchestration/universal-inbox`                  | GET    | ✅ | ✅ | ✅ | ✅   | users should filter by `assigned_to_user_id=me` |
| `/api/orchestration/universal-inbox/:id`              | GET    | ✅ | ✅ | ✅ | ✅   | item + assignment history |
| `/api/orchestration/universal-inbox`                  | POST   | ✅ | ✅ | — |     | admin: seed inbox items |
| `/api/orchestration/universal-inbox/:id/claim`        | POST   | ✅ | ✅ | ✅ |     | any authenticated user claims open items |
| `/api/orchestration/universal-inbox/:id/resolve`      | POST   | ✅ | ✅ | ✅ | ✅   | claimant/assignee resolves |
| `/api/orchestration/universal-inbox/:id/dismiss`      | POST   | ✅ | ✅ | ✅ | ✅   | claimant/assignee dismisses |
| `/api/orchestration/universal-inbox/:id/reassign`     | POST   | ✅ | ✅ | — |     | admin-only reassignment |
| `/api/orchestration/universal-inbox/assignments/list` | GET    | ✅ | ✅ | ✅ |     | read-only history |
| `/api/orchestration/notifications`                    | GET    | ✅ | ✅ | ✅ | ✅   | users should filter by `recipient_id=me&recipient_type=user` |
| `/api/orchestration/notifications/:id`                | GET    | ✅ | ✅ | ✅ | ✅   | read one |
| `/api/orchestration/notifications`                    | POST   | ✅ | ✅ | — |     | admin: fan-out system notification |
| `/api/orchestration/notifications/:id/mark-read`      | POST   | ✅ | ✅ | ✅ | ✅   | recipient marks read |
| `/api/orchestration/notifications/:id/dismiss`        | POST   | ✅ | ✅ | ✅ | ✅   | recipient dismisses |
| `/api/orchestration/notifications/mark-all-read`      | POST   | ✅ | ✅ | ✅ |     | self-service bulk mark-read |

## Matrix — Pages (erp-app)

Every page sits behind the app's auth gate. Admin-only pages additionally require `adminMiddleware` on the backing endpoints, so non-admin users will see read-only fallback UI (or 403 errors on mutations).

| Route | Page | SA | A | U | Notes |
|---|---|---|---|---|---|
| `/workflows`             | WorkflowDefinitionsPage | ✅ | ✅ | read | admin edit; user reads |
| `/workflows/:id`         | WorkflowDefinitionsPage (detail) | ✅ | ✅ | read | |
| `/workflow-runs`         | WorkflowRunsPage | ✅ | ✅ | ✅ | |
| `/workflow-runs/:id`     | WorkflowRunDetailPage | ✅ | ✅ | ✅ | step tree + jobs |
| `/workflow-triggers`     | WorkflowTriggersPage | ✅ | ✅ | — | admin-only |
| `/job-queue`             | JobQueuePage | ✅ | ✅ | ✅ | retry/cancel open to all authenticated users today |
| `/universal-inbox`       | UniversalInboxPage | ✅ | ✅ | ✅ | user-scoped work queue |
| `/inbox/:id`             | UniversalInboxPage (detail) | ✅ | ✅ | ✅ | |
| `/notifications`         | NotificationsPage | ✅ | ✅ | ✅ | user-scoped notification center |

## Invariants

1. **Every orchestration router** installs `authMiddleware` at the top. Trigger-admin and job-create endpoints additionally install `adminMiddleware` at the sub-router or handler level.
2. **No `sql.raw()` with user input** — all filter/sort parameters flow through `_safe-list-helpers.ts`. `sql.raw(column)` is only used after `safeIdentifier` whitelist validation inside the helper.
3. **Status lifecycles are CHECK-enforced** — `workflow_runs.status`, `workflow_step_runs.status`, `job_queue.status`, `universal_inbox.status`, `notifications.status` are all pinned via `CHECK` constraints in migration 00063. Illegal transitions fail at the DB level, not just application layer.
4. **Every mutation calls `logAudit(...)`** — creates a governance.audit_logs row capturing user, record, action, new values, IP.
5. **Legacy `state` column is preserved** for backward compatibility with 00024 code paths. The canonical column going forward is `status`; writes go to both (`status = 'X'`, `state = '<legacy-mapping>'`) until a later migration drops `state`.
6. **Own-record RLS at the app layer** — the API layer currently returns broader results; UI is responsible for filtering by `recipient_id=me` / `assigned_to_user_id=me`. A future tightening pass will add `Own`-level DB policies.
7. **Canonical notifications** — per registry decision D003, `orchestration.notifications` remains for in-process workflow fan-out; user-facing notification center cross-links to `comms.notifications` via `related_entity_type`.

## Out-of-scope / planned

- Per-workflow role ACL (only certain roles may trigger a given workflow) — planned for a later migration via a `workflow_permissions` table.
- Auditor read-only role — same plan as governance.
- Webhook-triggered auto-fire of enabled triggers (the scheduler loop is owned by nexus_engine — this domain stores the definitions).
