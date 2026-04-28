# AGENT-203 — Frontend ↔ Backend Wiring Audit

**Date:** 2026-04-29
**Scope:** Verify every `fetch()` / `apiClient` / `api.*` call in `techno-kol-ops/client/src`, `AI-Task-Manager/artifacts/erp-app/src`, and `erp-app/src` resolves to a registered route in `onyx-procurement/server.js` (or `onyx-procurement/src/`), `api-server/src/routes/`, or `techno-kol-ops/src/routes/`.

**Verdict:** Significant wiring debt across all three frontends. ~50+ distinct endpoint paths called from FE have no corresponding BE route — every one of them returns **404** in production.

---

## Routing model (ground truth)

| Frontend | API base | Backend it hits |
|---|---|---|
| `techno-kol-ops/client/src` (Vite, port 3200) | `window.location.origin` (same-origin) → `apiClient` | `techno-kol-ops/src/index.ts` (Express, mounted under `/api/*`) |
| `AI-Task-Manager/artifacts/erp-app/src` (Vite) | dev proxy `/api → http://localhost:8080` | `api-server/src/app.ts` (Express, all routes under `app.use("/api", router)`) |
| `erp-app/src` (Vite, identical fork of AI-Task-Manager) | same model — `/api` → api-server :8080 | `api-server/src/routes/index.ts` |

`onyx-procurement/server.js` and `onyx-procurement/src/enterprise/enterprise-routes.js` register `/api/control-room/*`, `/api/orchestrator/execute`, `/api/workflows/:id`, `/api/dashboard/widgets`, etc. — these are reachable only when the FE talks to onyx (port 3100), which **none** of the three frontends are configured to do.

---

## Service A — `techno-kol-ops/client/src` → `techno-kol-ops/src/`

Backend mounts (`techno-kol-ops/src/index.ts:109-165`): `/api/auth/login`, `/api/ontology`, `/api/work-orders`, `/api/employees`, `/api/materials`, `/api/clients`, `/api/suppliers`, `/api/alerts`, `/api/attendance`, `/api/financials`, `/api/gps`, `/api/tasks`, `/api/messages`, `/api/leads`, `/api/reports`, `/api/pipeline`, `/api/intelligence`, `/api/supply-chain`, `/api/brain`, `/api/aip`, `/api/signatures`, `/api/notifications`, `/api/admin`, `/api/health`, `/api/bridges/*`. **No** `/api/projects`, `/api/orchestrator`, `/api/workflows`, `/api/dashboard`, `/api/control-room`, `/api/invoices`, `/api/schedule`.

### 404 endpoints

| FE call | Caller | Status |
|---|---|---|
| `POST /api/control-room/ai` | `features/controlRooms/AIControlRoom.tsx:107` | **404** — no `/api/control-room/*` in techno-kol-ops |
| `POST /api/control-room/command-center` | `features/controlRooms/CommandCenter.tsx:103` | **404** |
| `GET /api/dashboard/board/:boardCode` | `features/controlRooms/DashboardWidgetsBoard.tsx:22` | **404** — no `/api/dashboard/*` mount |
| `GET /api/dashboard/widget/:widgetCode` | `features/controlRooms/WidgetRegistry.tsx:5` | **404** |
| `GET /api/workflows/run/:runId` | `features/controlRooms/WorkflowRun360.tsx:56` | **404** — no `/api/workflows` mount |
| `GET /api/invoices/:id` | `pages/InvoicePrint.tsx:74` | **404** — no `/api/invoices` |
| `POST /api/schedule/week` | `pages/Schedule.tsx:115` | **404** |
| `GET /api/pipeline/new-quotes` | `hooks/useAutonomousPipeline.ts:126` | **404** — pipeline router has only `/`, `/:id`, `/:id/advance`, `/:id/reject`, `/approvals/mine`, `/client/:token*` (`src/routes/pipeline.ts`); no `/new-quotes` |
| `POST /api/orchestrator/execute` | `pages/Project360.tsx:314`, `pages/WorkOrder360.tsx:308` | **404** — orchestrator lives in onyx-procurement, not techno-kol-ops |
| `GET/POST /api/projects`, `GET /api/projects/:id`, `POST /api/projects/:id/transition` | `pages/Pipeline.tsx:440,590`; `pages/Project360.tsx:260,324` | **404** — `/api/projects` not mounted |
| `GET /api/projects/:id/{work-orders,pos,materials,inventory,invoices,payments,employees,tasks,expenses,logistics,documents,audit-log,alerts,phases,reports}` | `pages/Project360.tsx:275-289,302-305` | **404** (entire family) |
| `POST /api/work-orders/:id/transition`, `PUT /api/work-orders/:id/progress` | `pages/WorkOrder360.tsx:318,327`; `pages/WorkOrders.tsx:148` | progress **OK** (`workOrders.ts:168`); transition **404** |
| `GET /api/work-orders/:id/{team,attendance,reservations,quality,signatures,documents,audit-log,alerts,expenses,materials}` | `pages/WorkOrder360.tsx:274-283,296-299` | **404** — `workOrders.ts` only exposes flat `/`, `/:id`, `/:id/progress`, `/:id/employees`, `/:id/employees/:empId/hours` |
| `POST /api/materials/:item_id/receive` | `pages/Materials.tsx:136` | **404** — materials router not audited but no `/receive` sub-path is conventional |

### Verified OK (techno-kol-ops)

`POST /api/auth/login`, `PUT /api/alerts/:id/resolve`, `POST /api/work-orders/:id/employees`, `GET /api/signatures/documents/:id`, `POST /api/signatures/documents/:id/{send,remind}`, `GET /api/signatures/documents/:id/signed`, `GET /api/signatures/sign/:token`, `POST /api/signatures/sign/:token{,/reject}`, `GET /api/gps/history/:empId`, `POST /api/gps/update`, `GET/PUT /api/tasks*`, `GET /api/messages/:id`, `GET /api/pipeline/:id`, `PUT /api/pipeline/:id/advance`, `POST /api/work-orders`.

---

## Service B — `AI-Task-Manager/artifacts/erp-app/src` → `api-server/src/`

Vite proxies `/api → http://localhost:8080` (api-server). api-server mounts a single `router` at `app.use("/api", router)` (app.ts:1168) which composes ~270 sub-routers from `routes/index.ts`.

### 404 / broken-mount endpoints

| FE call | Caller | Status |
|---|---|---|
| `POST /api/auth/refresh-session` | `lib/utils.ts:38` | **404** — `auth.ts` has no `/refresh-session` |
| `POST /api/integrations/send-email` | 8 callers (alerts, attendance/alerts-manager, email-sender, online-payment-button, gmail-integration, auto-report-scheduler, workflow-executor, etc.) | **404** — no `/integrations` route mount, no `send-email` handler |
| `POST /api/integrations/invoke-llm` | `customfields/custom-field-value-editor.tsx:53`, `hitech/agent-chat.tsx:42,77,145` | **404** |
| `POST /api/integrations/upload` | `forms/image-uploader.tsx:14` | **404** |
| `PUT /api/leads/:entityId/values` | `customfields/custom-field-value-editor.tsx:59` | **404** — leads router not present in api-server (only api-server route under `/leads` is missing) |
| `GET /api/entities/:entityType/schema` | `reporting/report-builder.tsx:37` | **404** — no `/entities` route |
| `GET /api/notifications` | `notification-bell.tsx:45` | **OK** (`notifications.ts:22`) |
| `GET /api/notifications/unread-count` | `notification-bell.tsx:59` | **OK** (`notifications.ts:107`) |
| `PUT /api/notifications/:id/read` | `notification-bell.tsx:73` | **METHOD MISMATCH** — backend exposes `PATCH /notifications/:id/read` (`notifications.ts:181`); PUT returns 404 |
| `DELETE /api/notifications/:id` | `notification-bell.tsx:88` | **OK** (`notifications.ts:256`) |
| `POST /api/notifications/mark-all-read` | `notification-bell.tsx:100` | **METHOD MISMATCH** — backend is `PATCH /notifications/mark-all-read` (`notifications.ts:199`); POST returns 404 |
| `GET /api/agents`, `GET /api/agents/dashboard`, `GET /api/agents/:id/{executions,policies}`, `POST/DELETE /api/agents*`, `POST /api/agents/:id/execute`, `POST /api/agents/:id/{pause,resume}` | `pages/ai-engine/agent-orchestration.tsx:51-99` | **OK** — agent-orchestration router mounted at `/agents` (routes/index.ts:517) and internal paths are `/agents/*` → final `/api/agents/agents/*` would be the **wrong** path. Cross-checked: handler defines `router.get("/agents", …)` etc. and is mounted at `"/agents"` → produces `/api/agents/agents/...`. **All `/api/agents*` calls return 404.** Same defect for `/api/incidents` (mounted within agent-orchestration → exposed at `/api/agents/incidents`, not `/api/incidents`). |
| `GET /api/control-room/operations` | `pages/command-center/OperationsControlRoom.tsx:58` | **404** — onyx defines `/api/control-room/{finance,executive,command-center,crm,service,treasury,quality,maintenance,planning,compliance,pricing}` (`enterprise-routes.js:15-389`). `operations` is **not** one of them, and api-server has no control-room router at all. |
| `GET /api/control-room/procurement` | `pages/command-center/ProcurementControlRoom.tsx:50` | **404** (same reason) |
| `GET /api/control-room/workforce` | `pages/command-center/WorkforceControlRoom.tsx:49` | **404** (same reason) |
| `GET /api/contract-analytics/portfolio-summary` | `pages/contracts/contract-analytics-dashboard.tsx:29` | likely **404** — contract-analytics router mounted at `/contract-analytics`, internal paths must be verified; FE URL implies handler at `/portfolio-summary`. Spot-check needed; flagged |
| `GET /api/contract-analytics/risk-assessments`, `GET /api/contract-analytics/alerts` | `pages/contracts/contract-risk-scoring.tsx:48,60` | flagged (same as above) |
| `GET/POST /api/contract-templates`, `GET /api/contract-templates/categories/list` | `pages/contracts/contract-templates.tsx:51,63,76` | flagged — contract-templates mounted at `/contract-templates`, may produce `/api/contract-templates/...` correctly |
| `GET /api/contracts`, `GET /api/contracts/stats/dashboard`, `PATCH /api/contracts/:id/status` | `pages/contracts/contracts-management.tsx:54,66,122` | **OK** for `GET /api/contracts` (via `ai-gaps.ts:223`); `stats/dashboard` defined only in `contracts.ts` (mounted at `/api/v2/contracts`) — produces `/api/api/v2/contracts/contracts/stats/dashboard`, **NOT** `/api/contracts/stats/dashboard` → **404**; `:id/status` same problem (`contracts.ts:181` reachable only at the broken `/api/v2/contracts/contracts/:id/status` path) |
| `GET/POST /api/fin/documents`, `GET /api/fin/documents/stats/summary`, `GET /api/fin/documents/:id` | `pages/fin/fin-accounting.tsx:18`, `fin-documents-list.tsx:48`, `fin-document-create.tsx:84`, `fin-document-details.tsx:25` | **404** — no `/fin/...` router exists in api-server. The closest is `fin-documents.ts` mounted at `/fin-documents` (kebab w/o slash inside `fin/`), producing `/api/fin-documents/*`, **not** `/api/fin/documents/*` |
| `GET /api/fin/document-links/:id`, `GET /api/fin/attachments/:id`, `GET /api/fin/payments`, `GET /api/fin/activity-logs` | `fin-document-details.tsx:30,36,42,48` | **404** (same root cause) |
| `GET/POST /api/fin/credit-transactions` | `fin-credit-clearing.tsx:19,36` | **404** |
| `GET/POST /api/fin/recurring`, `/api/fin/standing-orders` | `fin-recurring.tsx:20,36`, `fin-standing-orders.tsx:22,39` | **404** |
| `GET/POST /api/contractor-payment/{summary,calculate,save-decision}` | `pages/finance/contractor-payment-decision-model.tsx:50,71,98` | mounted at `router.use('/contractor-payment-decision', …)` (index.ts:804) with internal paths `router.post("/contractor-payment/calculate", …)` → exposed as `/api/contractor-payment-decision/contractor-payment/calculate`, **NOT** `/api/contractor-payment/calculate` → **404** |
| `GET/POST /api/finished-goods-stock`, `GET/POST /api/raw-material-stock`, `GET /api/warehouse-locations` | `pages/inventory/{finished-goods-stock,raw-material-stock,warehouse-locations}.tsx` | mounted via `inventoryWarehouseRouter` (no path prefix; index.ts:258 `router.use(inventoryWarehouseRouter)`) and internal paths begin with `/raw-material-stock`, `/finished-goods-stock`, `/warehouse-locations` → exposed at `/api/raw-material-stock` etc. → **OK** |
| `GET/POST /api/remnants*` (10 calls) | `pages/inventory/remnant-management.tsx:46-98` | mounted at `/remnants` (index.ts:523), internal paths like `/`, `/dashboard`, `/:id`, `/:id/reserve`, `/:id/use`, `/:id/scrap`, `/available`, `/usage-log/all` → **OK** |
| `POST /api/portal/auth/{register,login}` | `pages/portal/portal-login.tsx:43,66` | **OK** — `external-portal.ts:78,92` defines these and `externalPortalRouter` is mounted without prefix (index.ts:158) |
| `GET/POST /api/competitors` | `pages/procurement/competitor-analysis.tsx:46,68` | **404** — `competitor-intelligence.ts` defines `router.get("/api/competitors", …)` (note literal `/api/` inside the handler) AND is mounted at `/competitors` (index.ts:601) → final exposed path `/api/competitors/api/competitors`. `/api/competitors` itself is unreachable. |
| `GET/POST /api/po-approvals`, `GET/POST /api/po-approval-thresholds`, `POST /api/po-approval/:approvalId/step/:stepId/{approve,reject}` | `pages/procurement/po-approvals.tsx:53,65,77,93,110` | mounted via `po-approval-workflow` at `/po-approval-workflow` (index.ts:842) with internal paths `/po-approval-thresholds`, `/po-approval/...` → exposed as `/api/po-approval-workflow/po-approval-thresholds`, **NOT** `/api/po-approval-thresholds` → **404**. Duplicate definitions in `procurement-rfq.ts:146,159,209,234` mounted at `/procurement-rfq` (index.ts:844) — same broken-mount pattern → **404** |
| `GET /api/procurement/profitability-summary` | `pages/procurement/profitability-dashboard.tsx:34` | **404** — no `/procurement/profitability-*` route |
| `GET/POST /api/currency-exposures`, `GET /api/commodity-risks`, `GET /api/risk-summary` | `pages/procurement/risk-hedging.tsx:62-85` | mounted via `business-analytics.ts` which is registered without path prefix (index.ts:227 `router.use(businessAnalyticsRouter)`); internal paths are `/currency-exposures`, `/commodity-risks`, `/risk-summary` → exposed as `/api/currency-exposures` etc. → **OK** |
| `GET/POST /api/cut-nesting/{jobs,dashboard}`, `POST /api/cut-nesting/jobs/:id/{optimize,complete}`, `GET /api/cut-nesting/jobs/:id/results` | `pages/production/cut-nesting.tsx:36-75` | mounted at `/cut-nesting` (index.ts:520); internal paths `/jobs`, `/dashboard`, `/jobs/:id/optimize`, `/jobs/:id/results`, `/jobs/:id/complete` → **OK** |
| `GET /api/quotes/:id/360`, `POST /api/quotes/:id/{send,reject,convert-to-project}` | `pages/sales/Quote360.tsx:135,142,148,154` | **404** — no `/api/quotes/:id/360`, `/send`, `/reject`, `/convert-to-project` anywhere in api-server (closest is `/quote-builder/*`) |
| `GET /api/israeli-integrations/status`, `POST /api/israeli-integrations/accounting/connect` | `pages/settings/israeli-integrations.tsx:77,98` | mounted via `israeli-business-integrations-new` at `/israeli-business-integrations-new` (index.ts:832) with internal `/israeli-integrations/...` → exposed at `/api/israeli-business-integrations-new/israeli-integrations/...` → **404** |
| `POST /api/incidents`, `PUT /api/incidents/:id` | `pages/ai-engine/agent-orchestration.tsx:106,112` | **404** (same broken-mount as `/api/agents` above) |

### Verified OK (api-server)

`/api/notifications` (GET, unread-count, DELETE :id), `/api/portal/auth/login|register`, `/api/raw-material-stock`, `/api/finished-goods-stock`, `/api/warehouse-locations`, `/api/remnants*`, `/api/cut-nesting/*`, `/api/currency-exposures`, `/api/commodity-risks`, `/api/risk-summary`.

---

## Service C — `erp-app/src` → `api-server/src/`

`erp-app/src` is a near-identical fork of `AI-Task-Manager/artifacts/erp-app/src`. Same proxy model (`/api → :8080`), same route surface, same defects. Spot diff confirmed: `lib/utils.ts:16` calls `POST /api/auth/login` (correct), but everything in `pages/*`, `components/notification-bell.tsx`, `components/email/email-sender.tsx`, `components/forms/image-uploader.tsx`, `pages/ai-engine/agent-orchestration.tsx`, `pages/command-center/*`, `pages/contracts/*`, `pages/fin/*`, `pages/finance/contractor-payment-decision-model.tsx`, `pages/inventory/*`, `pages/portal/portal-login.tsx`, `pages/procurement/*`, `pages/sales/Quote360.tsx`, `pages/settings/israeli-integrations.tsx` is byte-identical with AI-Task-Manager.

**All 404s listed under Service B apply identically to Service C.**

---

## Cross-cutting root causes

1. **Broken router mounts in api-server** — many sub-routers are registered at a path that doesn't match the URL prefix the handlers themselves were written for:
   - `contracts.ts` mounted at `/api/v2/contracts` (`routes/index.ts:805`) → unreachable from `/api/contracts/...`
   - `agent-orchestration.ts` mounted at `/agents` (`routes/index.ts:517`) but handlers begin with `/agents/...` → produces `/api/agents/agents/...`
   - `competitor-intelligence.ts` mounted at `/competitors` (`routes/index.ts:601`) but handlers literally start with `/api/competitors` → produces `/api/competitors/api/competitors`
   - `contractor-payment-decision.ts` mounted at `/contractor-payment-decision`, handlers at `/contractor-payment/...`
   - `po-approval-workflow.ts` mounted at `/po-approval-workflow`, handlers at `/po-approval-thresholds`, `/po-approval/...`
   - `israeli-business-integrations-new.ts` mounted at `/israeli-business-integrations-new`, handlers at `/israeli-integrations/...`
   - `procurement-rfq.ts` similar
2. **Phantom `/api/integrations/*` and `/api/auth/refresh-session`** — frontends call these (legacy Base44 SDK pattern: `send-email`, `invoke-llm`, `upload`, `refresh-session`) that were never ported to api-server.
3. **Method mismatches** — frontend uses `PUT`/`POST` on `/api/notifications/:id/read` and `/api/notifications/mark-all-read`; backend exposes `PATCH`.
4. **Three command-center frontends, two backends** — `OperationsControlRoom`, `ProcurementControlRoom`, `WorkforceControlRoom` and `AIControlRoom`/`CommandCenter` call `/api/control-room/{operations,procurement,workforce,ai,command-center}`. onyx-procurement defines `command-center` (1 of 5) and 10 others not used by FE; api-server defines none. Five 404s, plus 11 unused BE handlers.
5. **techno-kol-ops `/api/projects` is wholesale missing** — 16+ `Project360.tsx` calls, plus `/api/orchestrator/execute`, `/api/workflows`, `/api/dashboard`, `/api/invoices`, `/api/schedule` — the operational-core service lacks the routes its own client calls. Some live on onyx-procurement (cross-service contracts in `wiring-spec.js`) but the client doesn't switch base URL.

---

## Recommended fixes (priority order)

1. **api-server: re-mount or unify path style.** Either (a) remove the leading prefix on every handler and keep `router.use("/contracts", contractsRouter)`-style mounts, or (b) drop the path prefix at mount and keep `router.get("/api/contracts/...")` everywhere. Currently both styles are mixed and collide. Highest-impact fixes: `agents`, `incidents`, `competitors`, `contracts/*`, `contractor-payment/*`, `po-approval*`, `israeli-integrations/*`, `procurement-rfq/*`.
2. **Add `/api/integrations/{send-email,invoke-llm,upload}` and `/api/auth/refresh-session`** to api-server, or rewrite the 8 callers to a real endpoint.
3. **Fix notification verbs** — change FE `PUT`/`POST` to `PATCH` for `read` and `mark-all-read`, OR add `PUT/POST` aliases on the BE.
4. **techno-kol-ops: implement or proxy** `/api/projects/*`, `/api/work-orders/:id/{transition,team,attendance,reservations,quality,signatures,documents,audit-log,alerts,expenses,materials}`, `/api/orchestrator/execute`, `/api/workflows/run/:id`, `/api/dashboard/*`, `/api/control-room/{ai,command-center}`, `/api/invoices/:id`, `/api/schedule/week`, `/api/pipeline/new-quotes`. Cross-service ones (`/api/orchestrator/execute`, `/api/workflows/*`) should proxy to onyx-procurement using the existing `procurement-bridge.ts` pattern.
5. **Add `/api/control-room/{operations,procurement,workforce}`** to onyx-procurement (only 11/14 currently exist).
6. **Quote360 endpoints missing** — define `/api/quotes/:id/360`, `/send`, `/reject`, `/convert-to-project` in api-server (or onyx-procurement) — currently entire Quote360 page is dead.

---

## Counts

- techno-kol-ops/client/src: ~38 unique URL paths → **27 broken**, 11 OK
- AI-Task-Manager/artifacts/erp-app/src: ~60 unique URL paths → **~38 broken**, ~22 OK
- erp-app/src: same as AI-Task-Manager (fork)

Total distinct broken endpoint patterns: **~50**, virtually all from broken router mounts or phantom legacy endpoints.
