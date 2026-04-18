# QA Agent 8 — API Test Analysis

**Generated:** 2026-04-18
**Scope:** `api-server/src/routes/**/*.ts` (static analysis, no network calls)

## Route coverage

- **total route files:** 430
- **total endpoints:** 5,661 (router.get|post|put|delete|patch)
- **unmounted route files:** 87 (route files not imported by `api-server/src/routes/index.ts`)
- **duplicate method+path pairs:** 190
- **mount groups in index.ts (`router.use('/api/...')`):** 200
- **routes missing auth middleware:** 4,128 (no `requireAuth|requireRole|authenticate|authMiddleware|requirePermission|verifyToken` referenced at handler line or file level)
- **routes missing try/catch:** 912
- **routes missing status code setter:** 882 (handlers that only call `res.json(...)` without `res.status(...)`)
- **routes with sensitive-data leak patterns:** 16 (response objects referencing `password|secret|api_key|access_token|refresh_token|apiKey`)

## Unmounted route files (sample — 30 of 87)

```
api-server/src/routes/ai-orchestration/ml-pipeline.ts
api-server/src/routes/ai-orchestration/orchestrator.ts
api-server/src/routes/claude/audit.ts
api-server/src/routes/claude/builder.ts
api-server/src/routes/claude/capabilities.ts
api-server/src/routes/claude/changesets.ts
api-server/src/routes/claude/code-executor.ts
api-server/src/routes/claude/context.ts
api-server/src/routes/claude/dataflow.ts
api-server/src/routes/claude/dependency-graph.ts
api-server/src/routes/claude/dev-support.ts
api-server/src/routes/claude/diagnostics.ts
api-server/src/routes/claude/execution-policy.ts
api-server/src/routes/claude/gaps.ts
api-server/src/routes/claude/governance.ts
api-server/src/routes/claude/health-check.ts
api-server/src/routes/claude/knowledge.ts
api-server/src/routes/claude/management.ts
api-server/src/routes/claude/middleware.ts
api-server/src/routes/claude/preview.ts
api-server/src/routes/claude/provider.ts
api-server/src/routes/claude/repair.ts
api-server/src/routes/claude/suggestions.ts
api-server/src/routes/claude/system.ts
api-server/src/routes/fin-seed.ts
api-server/src/routes/finance/gl-accounts.ts
api-server/src/routes/finance/journal-entries.ts
api-server/src/routes/kimi/dev-platform.ts
api-server/src/routes/kimi/provider.ts
api-server/src/routes/kobi/memory.ts
```

Note: unmounted files may be loaded dynamically or via wildcard import elsewhere — flagged as `uncertain` unless confirmed via grep in `index.ts`.

## Duplicate endpoints (top 50 method+path pairs across >1 file)

| endpoint | count | instances |
|---|---|---|
| POST /init | 30 | ai-document-intelligence-engine.ts:31 ; ai-engine-routes.ts:261 ; attendance-leave-engine.ts:15 +27 more |
| GET /dashboard | 29 | ai-document-intelligence-engine.ts:719 ; ai-engine-routes.ts:494 ; ai-operations.ts:34 +26 more |
| GET / | 11 | digital-contracts-signatures-engine.ts:454 ; fin-documents.ts:21 ; fin-payments.ts:16 +8 more |
| POST / | 10 | digital-contracts-signatures-engine.ts:394 ; fin-documents.ts:159 ; fin-payments.ts:44 +7 more |
| GET /:id | 9 | digital-contracts-signatures-engine.ts:502 ; fin-documents.ts:98 ; finance/gl-accounts.ts:49 +6 more |
| PUT /:id | 8 | digital-contracts-signatures-engine.ts:531 ; fin-documents.ts:255 ; finance/gl-accounts.ts:107 +5 more |
| GET /alerts | 5 | ceo-control-tower.ts:378 ; inventory-management.ts:183 ; realtime-financials-engine.ts:884 +2 more |
| GET /contracts | 4 | ai-gaps.ts:223 ; contracts.ts:104 ; crm-ultimate.ts:915 +1 more |
| POST /contracts | 4 | ai-gaps.ts:230 ; contracts.ts:87 ; crm-ultimate.ts:930 +1 more |
| PUT /contracts/:id | 4 | ai-gaps.ts:243 ; contracts.ts:152 ; crm-ultimate.ts:947 +1 more |
| GET /products | 4 | bom-product-engine.ts:422 ; data-fabric.ts:166 ; product-catalog.ts:122 +1 more |
| DELETE /:id | 4 | digital-contracts-signatures-engine.ts:580 ; project-costing-engine.ts:362 ; quality-control-engine.ts:312 +1 more |
| GET /rules | 3 | ai-autonomous-agent.ts:46 ; ai-document-intelligence-engine.ts:867 ; commission-calculator-engine.ts:234 |
| POST /seed | 3 | ai-autonomous-agent.ts:88 ; fin-router.ts:23 ; finance/gl-accounts.ts:142 |
| GET /events | 3 | ai-engine-routes.ts:314 ; data-platform-core.ts:125 ; realtime-platform.ts:47 |
| DELETE /contracts/:id | 3 | ai-gaps.ts:254 ; crm-ultimate.ts:961 ; digital-contracts-engine.ts:650 |
| POST /products | 3 | bom-product-engine.ts:398 ; product-catalog.ts:161 ; products.ts:33 |
| GET /products/:id | 3 | bom-product-engine.ts:436 ; product-catalog.ts:149 ; products.ts:20 |
| PUT /products/:id | 3 | bom-product-engine.ts:452 ; product-catalog.ts:189 ; products.ts:53 |
| GET /currency-exposures | 3 | business-analytics.ts:233 ; exchange-rates.ts:127 ; procurement-analysis.ts:212 |
| POST /currency-exposures | 3 | business-analytics.ts:243 ; exchange-rates.ts:143 ; procurement-analysis.ts:195 |
| GET /kpis | 3 | ceo-control-tower.ts:274 ; fin-quant.ts:526 ; realtime-platform.ts:193 |
| GET /contracts/:id | 3 | contracts.ts:134 ; crm-ultimate.ts:925 ; digital-contracts-engine.ts:543 |
| GET /notifications | 3 | crm-ultimate.ts:1089 ; notifications-hub.ts:9 ; notifications.ts:22 |
| DELETE /notifications/:id | 3 | crm-ultimate.ts:1134 ; notifications-hub.ts:103 ; notifications.ts:256 |
| GET /templates | 3 | digital-contracts-engine.ts:676 ; digital-contracts-signatures-engine.ts:1106 ; whatsapp-ai-engine.ts:1073 |
| POST /templates | 3 | digital-contracts-engine.ts:719 ; digital-contracts-signatures-engine.ts:1134 ; whatsapp-ai-engine.ts:1116 |
| PUT /templates/:id | 3 | digital-contracts-engine.ts:751 ; digital-contracts-signatures-engine.ts:1164 ; whatsapp-ai-engine.ts:1141 |
| POST /attendance/clock-in | 3 | hr-attendance-advanced.ts:1231 ; hr-enterprise.ts:479 ; module-path-aliases.ts:563 |
| POST /attendance/clock-out | 3 | hr-attendance-advanced.ts:1269 ; hr-enterprise.ts:521 ; module-path-aliases.ts:575 |
| GET /raw-materials | 3 | inventory-management.ts:65 ; raw-materials.ts:99 ; raw_materials.ts:9 |
| POST /raw-materials | 3 | inventory-management.ts:77 ; raw-materials.ts:207 ; raw_materials.ts:33 |
| POST /purchase-orders | 3 | inventory-management.ts:255 ; purchase-orders.ts:48 ; purchase_orders.ts:33 |
| GET /marketing/budget | 3 | marketing-enterprise.ts:227 ; module-path-aliases.ts:443 ; route-aliases.ts:119 |
| GET /agents | 2 | agent-orchestration.ts:89 ; crm-ultimate.ts:713 |
| GET /agents/:id | 2 | agent-orchestration.ts:106 ; crm-ultimate.ts:723 |
| POST /agents | 2 | agent-orchestration.ts:112 ; crm-ultimate.ts:735 |
| PUT /agents/:id | 2 | agent-orchestration.ts:120 ; crm-ultimate.ts:750 |
| DELETE /agents/:id | 2 | agent-orchestration.ts:137 ; crm-ultimate.ts:762 |
| GET /price-alerts | 2 | ai-document-intelligence-engine.ts:792 ; product-quote-engine.ts:934 |
| POST /rules | 2 | ai-document-intelligence-engine.ts:894 ; commission-calculator-engine.ts:273 |
| GET /stats | 2 | ai-engine-routes.ts:538 ; vector-search.ts:179 |
| GET /payroll-runs | 2 | attendance-payroll-engine.ts:1022 ; payroll-engine.ts:429 |
| GET /competitors | 2 | business-analytics.ts:62 ; procurement-analysis.ts:130 |
| POST /competitors | 2 | business-analytics.ts:72 ; procurement-analysis.ts:113 |
| PUT /competitors/:id | 2 | business-analytics.ts:93 ; procurement-analysis.ts:143 |
| POST /competitor-prices | 2 | business-analytics.ts:142 ; procurement-analysis.ts:160 |
| PUT /currency-exposures/:id | 2 | business-analytics.ts:261 ; exchange-rates.ts:152 |
| DELETE /currency-exposures/:id | 2 | business-analytics.ts:282 ; exchange-rates.ts:162 |
| GET /commodity-risks | 2 | business-analytics.ts:293 ; procurement-analysis.ts:248 |

Note: `POST /init` and `GET /dashboard` are boilerplate contributed by many engine files. Effective resource collisions are on `/contracts`, `/products`, `/templates`, `/notifications`, `/agents`, `/raw-materials`, `/purchase-orders`, `/attendance/clock-in-out`, `/competitors`, `/currency-exposures`. Final mounted path depends on `index.ts` `router.use('/api/...')` prefix — same sub-path under different mount prefixes is fine, but these resources are defined in 2-4 different engine files and need canonicalization.

## Sensitive-data leak patterns (16 findings)

| method | path | file:line |
|---|---|---|
| GET | /hub/n8n/status | api-server/src/routes/api-hub.ts:325 |
| POST | /api-keys | api-server/src/routes/api-keys.ts:9 |
| POST | /claude/chat/query | api-server/src/routes/claude/chat.ts:2471 |
| GET | /claude/chat/system-context | api-server/src/routes/claude/chat.ts:2490 |
| GET | /claude/chat/status | api-server/src/routes/claude/chat.ts:2499 |
| POST | /claude/chat/configure | api-server/src/routes/claude/chat.ts:2536 |
| PUT | /portal/management/users/:id | api-server/src/routes/external-portal.ts:420 |
| DELETE | /portal/management/users/:id | api-server/src/routes/external-portal.ts:437 |
| GET | /portal/management/invitations | api-server/src/routes/external-portal.ts:448 |
| POST | /portal/management/api-keys | api-server/src/routes/external-portal.ts:458 |
| GET | /integration-hub/webhooks | api-server/src/routes/integration-hub.ts:446 |
| PUT | /integration-hub/webhooks/:id | api-server/src/routes/integration-hub.ts:460 |
| GET | /integration-hub/autofix-log | api-server/src/routes/integration-hub.ts:1132 |
| GET | /integration-hub/n8n/config | api-server/src/routes/integration-hub.ts:1141 |
| GET | /mfa/status | api-server/src/routes/mfa.ts:26 |
| POST | /mfa/totp/setup | api-server/src/routes/mfa.ts:61 |

Evidence: handler returns JSON where the literal token/password/secret/api_key keys appear in the response payload. Some are legitimate (MFA setup returns TOTP secret on provisioning; api-key creation returns the key once). Others (webhooks, portal management) may leak secrets to clients — `uncertain` without manual review.

## Top 30 risky endpoints (missing auth guard)

| method | path | file:line | risk | severity |
|---|---|---|---|---|
| GET | /accounting-export/summary | api-server/src/routes/accounting-export.ts:125 | missing auth | HIGH |
| GET | /accounting-export/invoices.csv | api-server/src/routes/accounting-export.ts:232 | missing auth + data export | HIGH |
| GET | /accounting-export/payments.csv | api-server/src/routes/accounting-export.ts:332 | missing auth + data export | HIGH |
| GET | /accounting-export/expenses.csv | api-server/src/routes/accounting-export.ts:433 | missing auth + data export | HIGH |
| GET | /accounting-export/all.csv | api-server/src/routes/accounting-export.ts:547 | missing auth + mass export | CRITICAL |
| POST | /admin/run-backup | api-server/src/routes/admin-cron-triggers.ts:140 | missing auth + admin action | CRITICAL |
| POST | /admin/run-payment-reminders | api-server/src/routes/admin-cron-triggers.ts:150 | missing auth + admin action | CRITICAL |
| POST | /admin/run-low-stock-check | api-server/src/routes/admin-cron-triggers.ts:160 | missing auth + admin action | HIGH |
| POST | /admin/run-employee-alerts | api-server/src/routes/admin-cron-triggers.ts:170 | missing auth + admin action | HIGH |
| POST | /admin/run-session-cleanup | api-server/src/routes/admin-cron-triggers.ts:180 | missing auth + admin action | HIGH |
| POST | /admin/run-notification-cleanup | api-server/src/routes/admin-cron-triggers.ts:190 | missing auth + admin action | HIGH |
| GET | /admin/cron-status | api-server/src/routes/admin-cron-triggers.ts:200 | missing auth + admin info | MEDIUM |
| GET | /agent-performance/daily/:agentId | api-server/src/routes/agent-performance.ts:157 | missing auth + PII | HIGH |
| GET | /agent-performance/funnel/:agentId | api-server/src/routes/agent-performance.ts:172 | missing auth + PII | HIGH |
| GET | /agent-performance/calls/:agentId | api-server/src/routes/agent-performance.ts:185 | missing auth + PII | HIGH |
| GET | /agent-performance/rankings | api-server/src/routes/agent-performance.ts:205 | missing auth | MEDIUM |
| GET | /agent-performance/comparison | api-server/src/routes/agent-performance.ts:226 | missing auth | MEDIUM |
| GET | /agent-performance/alerts | api-server/src/routes/agent-performance.ts:247 | missing auth | MEDIUM |
| POST | /agent-performance/alerts/:id/acknowledge | api-server/src/routes/agent-performance.ts:258 | missing auth + mutation | HIGH |
| POST | /agent-performance/record-daily | api-server/src/routes/agent-performance.ts:267 | missing auth + mutation | HIGH |
| POST | /api-keys | api-server/src/routes/api-keys.ts:9 | missing auth + secret handling | CRITICAL |
| POST | /claude/chat/configure | api-server/src/routes/claude/chat.ts:2536 | missing auth + writes config secrets | CRITICAL |
| POST | /portal/management/api-keys | api-server/src/routes/external-portal.ts:458 | missing auth + issues API keys | CRITICAL |
| POST | /admin/run-backup | api-server/src/routes/admin-cron-triggers.ts:140 | missing auth + backup trigger | CRITICAL |
| PUT | /integration-hub/webhooks/:id | api-server/src/routes/integration-hub.ts:460 | missing auth + mutates webhooks | HIGH |
| POST | /mfa/totp/setup | api-server/src/routes/mfa.ts:61 | user-scoped, needs session auth | HIGH |
| GET | /mfa/status | api-server/src/routes/mfa.ts:26 | user-scoped, needs session auth | HIGH |
| POST | /seed (3 files) | ai-autonomous-agent.ts:88 ; fin-router.ts:23 ; finance/gl-accounts.ts:142 | missing auth + seed data writer | HIGH |
| POST | /init (30 files) | ai-document-intelligence-engine.ts:31 et al. | missing auth + engine-level init | MEDIUM |
| DELETE | /:id (4 files) | digital-contracts-signatures-engine.ts:580 et al. | missing auth + destructive | HIGH |

Caveat: detection is substring-based — routes mounted behind an upstream `app.use(authMiddleware)` in `index.ts` or `server.ts` would still show as "missing" here. Flag as `uncertain` for the 4,128 count; still — **administrative cron triggers, accounting exports, API-key issuance, and MFA setup endpoints all define their own router without importing any `requireAuth`-like helper at the top of the file**. These are genuinely high-risk unless a global middleware wraps all of `/api`.

## Error handling gaps (summary)

- Routes with no `try { }` block in handler body (first 60 lines): **912**
- Routes with no `res.status(...)` setter: **882** (rely on Express default 200)
- No explicit `next(err)` usage in 60-line handler window: similar magnitude (not separately counted)

These are hotspots for unhandled promise rejection crashes and for hiding validation failures under HTTP 200.

## Verdict: **high-risk**

Primary concerns:
1. **Mass unauthed administrative + export surface** — `/api/accounting-export/*.csv`, `/api/admin/run-*`, `/api/api-keys` POST, `/api/portal/management/api-keys` — CRITICAL if not globally gated
2. **Duplicate resource definitions** across engine files (contracts, products, templates, notifications, agents, raw-materials, purchase-orders) — whichever file is mounted last wins; dead code lives in the others
3. **87 unmounted route files** — either dead code (delete) or dynamic-loaded (verify)
4. **16 endpoints with sensitive-field patterns in response bodies** — need manual review to confirm none leak real secrets to clients
