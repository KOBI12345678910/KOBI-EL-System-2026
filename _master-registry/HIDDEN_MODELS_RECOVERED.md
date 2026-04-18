# HIDDEN MODELS RECOVERED

Generated: 2026-04-18

30 models that the registry marked as "missing" but that actually exist in the DB under a different schema OR have implementation without a backing table.

## A. Wrong-schema hidden (12) — ACTIVATED via registry pointer fix

| Model | Registry Before | DB Actual | Registry After | Recovery |
|---|---|---|---|---|
| customers | crm.customers | commercial.customers | commercial.customers | pointer rewrite done in Chapter 3 |
| opportunities | sales.opportunities | commercial.opportunities | commercial.opportunities | pointer rewrite done in Chapter 3 |
| quotes | sales.quotes | commercial.quotes | commercial.quotes | pointer rewrite done in Chapter 3 |
| approvals | sales.approvals | procurement.approvals | procurement.approvals | pointer rewrite done in Chapter 3 |
| projects | projects.projects | execution.projects | execution.projects | pointer rewrite done in Chapter 3 |
| project_phases | projects.project_phases | execution.project_phases | execution.project_phases | pointer rewrite done in Chapter 3 |
| employees | hr_workforce.employees | workforce.employees | workforce.employees | pointer rewrite done in Chapter 3 |
| documents | documents.documents | docs.documents | docs.documents | pointer rewrite done in Chapter 3 |
| document_versions | documents.document_versions | docs.document_versions | docs.document_versions | pointer rewrite done in Chapter 3 |
| signatures | documents.signatures | execution.signatures | execution.signatures | pointer rewrite done in Chapter 3 |
| attachments | documents.attachments | docs.attachments | docs.attachments | pointer rewrite done in Chapter 3 |
| forecast_models | analytics.forecast_models | intelligence.forecast_models | intelligence.forecast_models | pointer rewrite done in Chapter 3 |

## B. Has API route, no DB table (14) — build migration to activate

| Model | Expected Table (canonical) | API Files | Status |
|---|---|---|---|
| contacts | commercial.contacts | supplier-details.ts,suppliers.ts | queued |
| activities | commercial.activities | crm-ultimate.ts | queued |
| meetings | commercial.meetings | crm-ultimate.ts,hr-enterprise.ts | queued |
| milestones | execution.milestones | projects-module.ts,route-aliases.ts | queued |
| items | inventory.items | delivery-returns.ts | queued |
| reservations | inventory.reservations | quote-builder.ts | queued |
| schedules | execution.schedules | ai-agents-system.ts | queued |
| contractors | workforce.contractors | contractor-payment-engine.ts | queued |
| assignments | workforce.assignments | hr-enterprise.ts | queued |
| templates | docs.templates | contract-templates.ts | queued |
| dashboards | analytics.dashboards | bi-dashboards.ts | queued |
| reports | analytics.reports | external-api.ts | queued |
| scorecards | analytics.scorecards | supplier-intelligence-new.ts | queued |
| users | governance.users | auth.ts,audit-log.ts | queued |

## C. Has FE page/call, no DB table (4) — build migration + route

| Model | Expected Table (canonical) | FE Paths | Status |
|---|---|---|---|
| dependencies | execution.dependencies | supply-chain/bom-where-used | queued |
| drawings | execution.drawings | engineering/drawing-management | queued |
| raw_materials | inventory.raw_materials | procurement/raw_materials_list | queued |
| teams | workforce.teams | fabrication/installation-teams | queued |

## Summary
- 12 of 30 recovered in-place via Chapter 3 pointer rewrites.
- 14 require DB migration to activate existing API routes.
- 4 require full migration + route + FE wiring.
