# DOMAIN — governance — Permission Matrix

**Generated:** 2026-04-18
**Scope:** All `/api/governance/*` endpoints and `erp-app/src/pages/governance/*` surfaces.
**Rule:** Governance is the MOST RESTRICTIVE domain. All reads and writes require `adminMiddleware` (`req.isSuperAdmin === true`). No role-level exceptions except where noted.

## Legend

| symbol | meaning |
|---|---|
| SA | superadmin only |
| A | admin |
| Aud | auditor (read-only) — planned |
| — | not allowed |

## Matrix — API endpoints

| Endpoint | Method | SA | A | Aud | Notes |
|---|---|---|---|---|---|
| `/api/governance/users` | GET | ✅ | ✅ | ✅ | admin middleware today; auditor is planned |
| `/api/governance/users` | POST | ✅ | ✅ | — | |
| `/api/governance/users/:id` | PATCH | ✅ | ✅ | — | |
| `/api/governance/users/:id` | DELETE | ✅ | — | — | SA only — destructive identity action |
| `/api/governance/users/:id/assign-role` | POST | ✅ | ✅ | — | |
| `/api/governance/users/:id/revoke-role` | POST | ✅ | ✅ | — | |
| `/api/governance/roles` | GET | ✅ | ✅ | ✅ | |
| `/api/governance/roles` | POST | ✅ | — | — | SA only — creating new role |
| `/api/governance/roles/:id` | PATCH | ✅ | — | — | SA only; `is_system=true` blocked entirely |
| `/api/governance/roles/:id` | DELETE | ✅ | — | — | SA only; `is_system=true` blocked entirely |
| `/api/governance/permissions` | GET | ✅ | ✅ | ✅ | |
| `/api/governance/permissions` | POST | ✅ | — | — | SA only |
| `/api/governance/permissions/grant` | POST | ✅ | — | — | SA only — grant to role |
| `/api/governance/permissions/revoke` | POST | ✅ | — | — | SA only — revoke from role |
| `/api/governance/audit-logs` | GET | ✅ | ✅ | ✅ | Read-only; no PATCH/DELETE ever |
| `/api/governance/state-history` | GET | ✅ | ✅ | ✅ | Read-only |
| `/api/governance/domain-events` | GET | ✅ | ✅ | ✅ | Read-only |
| `/api/governance/webhooks` | CRUD | ✅ | ✅ | read | |
| `/api/governance/webhooks/:id/test-delivery` | POST | ✅ | ✅ | — | |
| `/api/governance/webhook-deliveries` | GET | ✅ | ✅ | ✅ | Read-only |
| `/api/governance/integrations` | CRUD | ✅ | ✅ | read | |
| `/api/governance/integrations/:id/sync-now` | POST | ✅ | ✅ | — | |
| `/api/governance/integration-sync-logs` | GET | ✅ | ✅ | ✅ | Read-only |
| `/api/governance/feature-flags` | CRUD | ✅ | ✅ | read | |
| `/api/governance/feature-flags/targets` | POST | ✅ | ✅ | — | |
| `/api/governance/saved-filters` | CRUD | ✅ | ✅ | read | |
| `/api/governance/user-preferences` | PUT | ✅ | ✅ | — | |
| `/api/governance/config` | CRUD | ✅ | ✅ | read | `is_secret` entries: values redacted in non-SA responses (planned) |
| `/api/governance/queue-jobs` | GET | ✅ | ✅ | ✅ | |
| `/api/governance/queue-jobs/:id/retry` | POST | ✅ | ✅ | — | |
| `/api/governance/queue-jobs/:id/cancel` | POST | ✅ | ✅ | — | |
| `/api/governance/sla-timers` | GET/POST | ✅ | ✅ | read | |
| `/api/governance/sla-timers/:id/extend` | POST | ✅ | ✅ | — | |
| `/api/governance/sla-timers/:id/resolve` | POST | ✅ | ✅ | — | |
| `/api/governance/escalation-rules` | CRUD | ✅ | ✅ | read | |
| `/api/governance/escalation-rules/trigger` | POST | ✅ | ✅ | — | |
| `/api/governance/health-checks` | GET | ✅ | ✅ | ✅ | |
| `/api/governance/validations-log` | GET | ✅ | ✅ | ✅ | |
| `/api/governance/validations-log/:id/resolve` | POST | ✅ | ✅ | — | |
| `/api/governance/security-events` | GET | ✅ | ✅ | ✅ | |
| `/api/governance/security-events/:id/acknowledge` | POST | ✅ | ✅ | — | |
| `/api/governance/command-logs` | GET | ✅ | ✅ | ✅ | Read-only |

## Matrix — Pages (erp-app)

All governance pages are mounted in `App.tsx` and route guard is applied via the existing admin-auth flow. Non-admin users should not see the sidebar entries — menu insertion in `00060` does not imply visibility, which is gated client-side by role.

| Route | Page | SA | A |
|---|---|---|---|
| `/users` | UsersPage | ✅ | ✅ |
| `/roles` | RolesPage | ✅ | ✅ (read) |
| `/permissions` | PermissionsPage | ✅ | ✅ (read) |
| `/audit-logs` | AuditLogsPage | ✅ | ✅ |
| `/state-history` | StateHistoryPage | ✅ | ✅ |
| `/domain-events` | DomainEventsPage | ✅ | ✅ |
| `/webhooks` | WebhooksPage | ✅ | ✅ |
| `/webhook-deliveries` | WebhookDeliveriesPage | ✅ | ✅ |
| `/integrations` | IntegrationsPage | ✅ | ✅ |
| `/integration-sync-logs` | IntegrationSyncLogsPage | ✅ | ✅ |
| `/feature-flags` | FeatureFlagsPage | ✅ | ✅ |
| `/health-checks` | HealthChecksPage | ✅ | ✅ |
| `/validations-log` | ValidationsLogPage | ✅ | ✅ |
| `/config` | ConfigEntriesPage | ✅ | ✅ |
| `/queue-jobs` | QueueJobsPage | ✅ | ✅ |
| `/sla-timers` | SLATimersPage | ✅ | ✅ |
| `/escalation-rules` | EscalationRulesPage | ✅ | ✅ |
| `/security-events` | SecurityEventsPage | ✅ | ✅ |

## Invariants

1. **Every governance router** includes `router.use(authMiddleware, adminMiddleware)` at the top — no endpoint is reachable without JWT + superadmin.
2. **No `sql.raw()` with user-derived input** — all filter/sort parameters flow through `_safe-list-helpers.ts`.
3. **System roles/permissions are immutable** — `roles.patch` and `roles.delete` reject rows where `is_system = true`.
4. **audit_logs is append-only** — no PATCH/DELETE endpoint on audit logs exists in this tier.
5. **Secret config entries** — the `is_secret = true` flag marks an entry for server-side redaction; redaction logic is reserved for a later tier but the flag is stored now.
6. **Every mutation calls `logAudit(...)`** — creates a governance.audit_logs row capturing user, record, action, old/new values, IP.
