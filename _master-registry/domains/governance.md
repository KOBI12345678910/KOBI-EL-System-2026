# DOMAIN — governance

| Field | Value |
|---|---|
| Generated | 2026-04-18 |
| Canonical schema | `governance` |
| Evidence | `B-E013` `B-E015` QA_AGENT_12_PERMISSIONS.md QA_AGENT_13_SECURITY.md DISCOVERY §B §D |

## 1. domain_checklist

### expected_models (32)
users_profile (canonical identity), roles, permissions, role_permissions, user_roles, audit_logs, audit_log_attachments, feature_flags, feature_flag_targets, config_entries, domain_events, event_subscriptions, event_deliveries, webhook_endpoints, webhook_deliveries, health_checks, idempotency_keys, integration_connections, integration_sync_logs, job_executions, queue_jobs, object_permissions, saved_filters, security_events, sla_timers, state_history, user_preferences, validations_log, workflow_instances, workflow_step_executions, workflow_steps, workflows, alert_subscriptions, escalation_rules, command_logs — plus planned: users(view), change_logs(alias→audit_logs), system_settings(alias→config_entries), validation_rules, data_quality_issues

### required_pages
UsersAdmin, RolesAdmin, PermissionsMatrix, RolePermissionsPage, UserRolesPage, AuditLogExplorer, FeatureFlagsAdmin, FeatureFlagTargetsPage, ConfigEntriesPage, DomainEventsExplorer, WebhookEndpointsAdmin, WebhookDeliveriesList, IntegrationConnectionsAdmin, IntegrationSyncLogsPage, SecurityEventsPage, EscalationRulesAdmin, AlertSubscriptionsPage, ObjectPermissionsPage, SavedFiltersPerUser, SLAtimersPage, HealthChecksPage, WorkflowsAdmin, WorkflowInstancesPage, DataQualityIssuesQueue (planned), ValidationRulesAdmin (planned)

### required_forms
NewUser, AssignRole, NewRole, EditPermissionMatrix, NewFeatureFlag, TargetFeatureFlag, NewWebhook, TestWebhook, NewIntegration, NewEscalationRule, NewAlertSubscription, NewValidationRule, CloseDataQualityIssue

### required_routes
`/admin/users`, `/admin/roles`, `/admin/permissions`, `/admin/audit`, `/admin/feature-flags`, `/admin/config`, `/admin/events`, `/admin/webhooks`, `/admin/integrations`, `/admin/security`, `/admin/escalations`, `/admin/alerts`, `/admin/sla`, `/admin/health`, `/admin/workflows`, `/admin/data-quality`, `/admin/validation-rules`

### required_reports
audit_activity_report, security_incidents_report, webhook_delivery_health_report, workflow_instance_performance_report

### required_dashboards
GovernanceControlRoom (planned)

### required_flows
- approval workflow infrastructure (feeds every domain)
- alert → escalation → action loop
- webhook delivery + retry state machine

### critical_relations
- roles *—* permissions via role_permissions
- users_profile *—* roles via user_roles
- webhook_endpoints 1—* webhook_deliveries
- event_subscriptions 1—* event_deliveries
- workflows 1—* workflow_steps 1—* workflow_step_executions; workflows 1—* workflow_instances
- everything → audit_logs via governance.audit_logs triggers

### completion_gate
- roles / permissions / user_roles MUST be canonical (NOT duplicates — D003/D009 decision)
- webhook_endpoints / webhook_deliveries / sla_timers / integration_connections need explicit exposure decisions

## 2. DISCOVERY

| layer | count |
|---|---:|
| DB tables governance.* | 34 |
| Registry models | 4 full + 28 partial |
| API routers | 22 |
| Pages | 18 under /admin |
| Menu entries | 19 |
| Dashboards | 0 (planned GovernanceControlRoom) |
| Reports | 0 connected |

## 3. GAPS

| class | items |
|---|---|
| **planned_locked** | users(view), change_logs(alias), system_settings(alias), validation_rules, data_quality_issues |
| **built_internal_only (legitimate)** | idempotency_keys, state_history, domain_events, event_deliveries, webhook_deliveries, sla_timers, health_checks, command_logs, validations_log, job_executions, queue_jobs, security_events, user_preferences, saved_filters, audit_log_attachments, alert_subscriptions, event_subscriptions, feature_flag_targets |
| **built_not_exposed (admin UI missing — red)** | escalation_rules, integration_connections, integration_sync_logs, object_permissions, webhook_endpoints, config_entries, workflow_step_executions, workflow_instances |

## 4. ACTIONS

| action | items |
|---|---|
| recover_now | canonicalize roles/permissions (D003/D009); decision on `users` view; build missing admin pages |
| build_now | validation_rules + data_quality_issues + integration admin + webhook admin |
| internal_only | 18 plumbing tables listed above |
| postpone | — |
| remove_from_registry | N/A |

## 5. DEPLOYMENT

0/34 tables verified; pending.

## 6. COVERAGE

| metric | value |
|---|---|
| completion_percent | 35 |
| business_readiness | partial |
| gate_status | blocked — admin surfaces missing for 8 red tables |
| red rows | 8 |
