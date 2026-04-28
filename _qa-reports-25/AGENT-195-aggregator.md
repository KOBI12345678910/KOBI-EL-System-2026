# AGENT-195 — Master Findings Aggregator

**Date:** 2026-04-29
**Scope:** All 21 completed `_qa-reports-25/AGENT-*.md` reports.
**Mode:** Read-only aggregation. Deduped across reports; severity normalized to `CRIT / HIGH / MED / LOW / INFO`.
**Sources:** AGENT-03, 04, 05, 09, 10, 15, 16, 17, 19, 20, 21, 26, 27, 28, 29, 30, 31, 48, 60, 79, 167.

---

## 1. Counts at a glance

| Severity | Count |
|----------|------:|
| CRIT | 14 |
| HIGH | 53 |
| MED  | 75 |
| LOW  | 47 |
| INFO | 9 |
| **Total** | **198** |

| Fix-type bucket | Count |
|------|------:|
| db-rls / migration | 13 |
| db-schema / index | 9 |
| security / auth | 12 |
| runtime-config (env / dotenv / port) | 18 |
| code-defect / logic-bug | 27 |
| spec-drift (CLAUDE.md vs code) | 15 |
| missing-impl (stub / scaffold) | 21 |
| pipeline-wiring (events, listeners, routes) | 14 |
| il-compliance (tax / payroll / forms) | 11 |
| ui-rtl / a11y | 19 |
| ci-cd / docker / deploy | 16 |
| docs / dead-code / cleanup | 12 |
| pwa / mobile | 6 |
| dependency / version skew | 5 |

---

## 2. Master CSV-like list

Columns: `id, severity, fix_type, area, file_or_path, finding, source_agents`

```csv
id,severity,fix_type,area,file_or_path,finding,sources
F001,CRIT,runtime-config,onyx-ai,onyx-ai/src/index.ts:2990,Bootstrap requires ./onyx-platform but every recent endpoint fix lives in index.ts; bridge endpoints 404 in production,03
F002,CRIT,runtime-config,onyx-ai,onyx-ai/src/,dotenv never imported anywhere in src/; every API key undefined unless shell-exported,03
F003,CRIT,security,onyx-ai,onyx-ai/src/index.ts onyx-platform.ts,/api/kill /api/resume /api/knowledge/entity /api/notifications/* unauthenticated in both files,03
F004,CRIT,db-rls,supabase,public.* (59 tables),RLS DISABLED entirely on 59 production tables incl api_keys env_variables tax_rules webhooks user_integrations analytics_events system_logs,09
F005,CRIT,db-rls,supabase,5 platform_* tables,RLS ENABLED but zero policies (platform_api_keys platform_invoices platform_metrics_global platform_organizations platform_webhooks),09
F006,CRIT,db-rls,supabase,public.* (244 tables / 318 policies),USING(true) always-true policies; no tenant_id filter; multi-tenant isolation not in effect anywhere on customer-data surface,09
F007,CRIT,security,erp-app,erp-app/index.html,RTL root direction missing on <html>; only on body via CSS; portals/Radix popovers may render LTR,10,17
F008,CRIT,spec-drift,architecture,techno-kol-ops/src/index.ts:2979,ONYX_AI default port is 3200 (collision with OPS); CLAUDE.md says 3300; ONYX_AI_URL also defaults to 3200,15,21,03
F009,CRIT,missing-impl,architecture,onyx-procurement/server.js,Pipeline blueprint APIs not registered (/api/wiring/spec /api/entity-map/:type /api/state-machines/:type/transitions /api/orchestrator/execute /api/pipeline/stages /api/workflows/:id) — WorkOrder360 client 404s,15,26
F010,CRIT,pipeline-wiring,orchestrator,onyx-procurement/src/pipeline/orchestrator.js:270-298,executeOrchestration is a scaffold: preconditions not enforced effects not applied events never published; 12 listener names dangling,31,79,16
F011,CRIT,missing-impl,pipeline-engine,onyx-procurement/src/pipeline/pipeline-engine.js,POST /api/pipeline/trigger only logs; never dispatches actions to orchestrator; 11 EVENT_TRIGGERS have no consumer,26
F012,CRIT,db-schema,pipeline,onyx-procurement,Tables pipeline_items pipeline_transitions pipeline_events referenced by routes but no migration creates them; column shape mismatches OPS,26
F013,CRIT,il-compliance,procurement-payroll,onyx-procurement/src/payroll/wage-slip-calculator.js,All 2026 tax constants ESTIMATED — must verify against ילקוט פרסומים; production payroll runs blocked,04,19
F014,CRIT,il-compliance,procurement-payroll,onyx-procurement/src/payroll/wage-slip-calculator.js,Bituach Leumi rounding: code uses half-away-from-zero; tax authority requires floor-to-agora; Form 102 batch rejection per agora drift,04
F015,HIGH,runtime-config,onyx-ai,Dockerfile entrypoint.js,Port chaos: .env=3200 CLAUDE.md=3300 Dockerfile=3300 entrypoint listens 3300 proxies 3301 APIServer.start default 3100; collision likely,03
F016,HIGH,security,onyx-ai,onyx-ai/src/index.ts:2280-2284,APIServer wildcard CORS + zero security headers in the dead path; helmet/cors/rate-limit deps declared but not used,03
F017,HIGH,code-defect,onyx-ai,agents/src/llm/client.ts (lines 48 69 100 120),Anthropic messages.create has no try/catch no retry no rate-limit no circuit-breaker; 429 propagates as unhandled rejection,03
F018,HIGH,security,onyx-ai,src/index.ts onyx-platform.ts readBody,No Content-Length limit on readBody; unbounded request body,03
F019,HIGH,code-defect,onyx-ai,onyx-ai/src/index.ts vs onyx-platform.ts,EventStore.append signature mismatch: index.ts loose vs onyx-platform.ts strict; runtime breakage when route handlers call without aggregateId,03
F020,HIGH,missing-impl,onyx-ai,onyx-ai/src/health.ts onyx-ai/src/security.ts,INSTRUCTIONS_TO_WIRE.md not applied; both modules dead code,03
F021,HIGH,il-compliance,procurement-payroll,onyx-procurement/src/payroll/wage-slip-calculator.js,Sick-pay flattened to 50% — law requires day1=0 day2-3=50 day4+=100; under-pays employees on long sick leaves,04,19
F022,HIGH,il-compliance,procurement-payroll,onyx-procurement/src/payroll/wage-slip-calculator.js,Income-tax annualisation naive (monthly*12); ignores YTD true-up; bonus months over-deduct ~10-15%; Form 106 will not balance,04
F023,HIGH,il-compliance,procurement-payroll,onyx-procurement/src/payroll/wage-slip-calculator.js,All allowances treated as taxable; missing שווי / נסיעות / meal exemptions; over-deducts; non-compliant פקודת מס הכנסה ס׳ 32,04
F024,HIGH,code-defect,procurement-payroll,onyx-procurement/src/payroll/wage-slip-calculator.js,Hourly vacation_pay = hours * employee.base_salary; if base_salary is monthly value catastrophic over-payment,04
F025,HIGH,il-compliance,procurement-vat,onyx-procurement/src/vat/,No PCN874 (monthly summary) builder; only PCN836 (detail) — legacy flat-file fallback missing,19
F026,HIGH,dependency,ai-task-manager,AI-Task-Manager/lib/integrations*/anthropic-ai/,Duplicate workspace package name @workspace/integrations-anthropic-ai (one full one stub); pnpm install will fail or silently pick stub,05
F027,HIGH,db-schema,supabase,57 vertical-domain tables,Tables missing tenant_id column despite multi-tenant project; agri/ai/ap/ar/auto/bank/crm/ecom etc child tables,09
F028,HIGH,db-index,supabase,167 FK columns,FK columns without indexes (AP/AR/Procurement/Inventory/Manufacturing); cause seq scans on cascading deletes and joins,09
F029,HIGH,db-index,supabase,29 tables,tenant_id columns without index; enabling tenant RLS will table-scan every query,09
F030,HIGH,security,supabase,FOR INSERT policies,Several INSERT policies have WITH CHECK NULL (ai_messages ai_sessions ap_*_write gl_*_insert order_status_history); effectively unrestricted,09
F031,HIGH,ui-rtl,erp-app,erp-app/index.html,P0: index.html missing dir="rtl"; per-component <div dir="rtl"> wrappers in 50+ pages will not cover portals/toasts/dialogs,10,17
F032,HIGH,ui-rtl,techno-kol-ops,techno-kol-ops/client/src/components/Sidebar.tsx,borderLeft/borderRight literal directions (lines 57 95) instead of borderInlineStart/End,10
F033,HIGH,ui-rtl,multiple,erp-app techno-kol-ops onyx-procurement,Zero <bdi>/unicode-bidi:isolate usage; mixed Hebrew+Latin (numbers ₪ kWh IBANs emails) misorder on Safari and Chromium,10,17
F034,HIGH,ui-rtl,ai-task-manager,AI-Task-Manager/artifacts/erp-app and others,No i18n library anywhere (no i18next/react-intl); ~250+ inline-Hebrew literals across all front-ends,10
F035,HIGH,missing-impl,techno-kol-ops,techno-kol-ops/client,Dashboard.tsx and Pipeline.tsx have zero loading/skeleton/error UI; first paint is broken layout,10
F036,HIGH,spec-drift,architecture,packages/shared-*/,8 of 8 shared-* dirs have NO package.json; matched by workspaces glob but skipped by npm; consumed via raw relative paths only,15
F037,HIGH,spec-drift,architecture,onyx-procurement payroll-autonomous,Payroll exists in BOTH services (procurement registers routes AND mounts payroll-autonomous/dist at /payroll); two parallel implementations,15
F038,HIGH,spec-drift,architecture,onyx-procurement onyx-ai techno-kol-ops,AI logic lives in three places (procurement/src/ai onyx-ai/src techno-kol-ops/src/index.ts:2877+); no single owner,15
F039,HIGH,spec-drift,state-machines,onyx-procurement/src/pipeline/state-machines.js,15 machines / 115 transitions vs CLAUDE.md spec of 13 / 91 — doc undercounts,16,29
F040,HIGH,code-defect,orchestrator,onyx-procurement/src/pipeline/orchestrator.js,3 broken preconditions: project.create_work_order references in_production (valid: in_procurement); rfq.convert_to_po references decided (valid: approved); work_order.signoff references done (valid: completed),16
F041,HIGH,code-defect,state-machines,onyx-procurement/src/pipeline/state-machines.js,Dead state quote.deleted: declared final but no transition leads to it,16,29
F042,HIGH,pipeline-wiring,orchestrator,onyx-procurement/src/pipeline/orchestrator.js,32 trigger entries reference 28 distinct action names — none resolve to real handlers; getTriggersForTransition has no caller,16
F043,HIGH,missing-impl,state-machines,onyx-procurement/src/pipeline/state-machines.js,No POST /api/state-machines/:type/transition route; SM is read-only over HTTP; transition executor missing,16
F044,HIGH,pwa,erp-app,erp-app/vite.config.ts,vite-plugin-pwa not imported; src/sw-custom.ts is dead code; app ships without service worker despite intent,17
F045,HIGH,pwa,techno-kol-ops,techno-kol-ops/client/vite.config.ts,vite-plugin-pwa declared in package.json but never invoked in vite.config.ts,17
F046,HIGH,ci-cd,deploy,docker-compose.prod.yml + Dockerfiles,Healthcheck path mismatch: compose uses /health while Dockerfiles+Railway use /healthz; only onyx-procurement exposes both,20,21
F047,HIGH,ci-cd,deploy,docker/onyx-procurement.Dockerfile,Uses npm install --omit=dev not npm ci; lockfile drift silently allowed in deps stage,20
F048,HIGH,ci-cd,deploy,.github/workflows/deploy.yml,deploy job is summary-only echo; no kubectl apply no Cloud Run deploy no smoke test no rollback,20,167
F049,HIGH,ci-cd,deploy,.github/workflows/,No DB migration step in CI/CD; manual via runbook; no gate preventing image deploy against non-migrated DB,20
F050,HIGH,security,deploy,k8s/02-secret.yaml + .env files,No Vault / SOPS / External Secrets / Sealed Secrets; raw env files only; AUTH_MODE=api_key with hardcoded dev-admin-api-key in .env.example,20
F051,HIGH,security,deploy,all 3 Node services,No global pino redact config; ad-hoc req.body logs leak emails IDs JWTs,20
F052,HIGH,runtime-config,ai-task-manager,AI-Task-Manager/artifacts/api-server/src/index.ts:24-36,api-server throws if PORT env not provided (no default); zero-env smoke crashes immediately; start runs bash script (Windows-hostile),21
F053,HIGH,missing-impl,pipeline-engine,onyx-procurement/src/pipeline/pipeline-engine.js,POST /api/pipeline/items/:id/advance lacks state-machine validation; can jump quote to closure if body sets next_stage,26
F054,HIGH,missing-impl,workflow-flows,onyx-procurement/src/pipeline/workflow-flows.js,All 5 flows missing entry guards exits and error states uniformly; no compensation/triggers/SLA/role,28
F055,HIGH,spec-drift,workflow-flows,onyx-procurement/src/pipeline/workflow-flows.js,13 of 22 step actions have no executable handler in orchestrator (qualify start_planning request_materials create_rfq compare_and_approve send_and_receive reserve_for_project start_execution complete mark_billable register attend_work approve_and_export),28
F056,HIGH,spec-drift,workflow-flows,onyx-procurement/src/pipeline/workflow-flows.js,5 entities referenced by flows missing from entity-map (material_request inventory attendance payroll bank_match),28
F057,HIGH,spec-drift,workflow-flows,onyx-procurement/src/pipeline/workflow-flows.js,Master Flow gaps: no Order step (Stage 4) no Delivery step (Stage 10) no Closure step (Stage 13) no quality_check/signoff explicit,28
F058,HIGH,spec-drift,shared-workflows,packages/shared-workflows/machines.js,Naming convention drift: package uses PascalCase canonical uses snake_case; consumer feeding DB status hits Unknown state at transition-engine.js:82,60
F059,HIGH,missing-impl,shared-workflows,packages/shared-workflows/,No flows.js / WORKFLOW_FLOWS in package; 5 business-flow definitions live only in onyx-procurement,60
F060,HIGH,spec-drift,shared-workflows,packages/shared-workflows/machines.js,Major drift on Task and Alert machines (different state sets); missing employee contract document machines,60
F061,HIGH,pipeline-wiring,event-bus,onyx-procurement/src/pipeline/orchestrator.js,12 listener names dangling: orchestrator never imports event-bus.js or domain-events.js; never publishes events,79,16
F062,HIGH,missing-impl,finance360,onyx-procurement/src/features/finance/Finance360.tsx,Aggregate Finance360 ships 4 of 12 spec tabs; 0 of 5 primary actions; missing AP/GL/cashflow/budget/VAT/tax/costing,48
F063,HIGH,spec-drift,finance360,onyx-procurement techno-kol-ops,Two Finance360 components with incompatible scopes (aggregate vs per-record); naming collision,48
F064,HIGH,ci-cd,workflows,.github/workflows/ci.yml deploy-preview.yml security.yml,Triggers reference only main but repo's main branch is master; CI never runs on master pushes,167
F065,HIGH,ci-cd,workflows,all 4 .github/workflows/*.yml,No timeout-minutes on any job; runaway tests can burn 6h default,167
F066,MED,code-defect,onyx-ai,onyx-ai/src/{index.ts onyx-platform.ts onyx-integrations.ts},Three parallel platform files with diverging EventStore.append APIServer.start route tables; drift inevitable,03
F067,MED,security,onyx-ai,APIServer error handler,Error messages leaked to client unfiltered; no correlation ID; no logging,03
F068,MED,code-defect,onyx-ai,agents/src/tools/tokenTrackerTool.ts:17-21,Hard-coded model pricing client-side; will drift the moment Anthropic changes prices,03
F069,MED,runtime-config,onyx-ai,onyx-ai/entrypoint.js,Returns canned health response masking real platform failure (proxy returns its own {service version status} for / /healthz /livez),03
F070,MED,code-defect,onyx-ai,onyx-ai/src/index.ts:122,Math.random() in BackoffCalculator jitter despite no-Math-random banner,03
F071,MED,code-defect,onyx-ai,onyx-ai/src/index.ts:3004,ONYX_GLOBAL_BUDGET env declared but Governor constructor doesn't accept it (silently dropped),03,16
F072,MED,code-defect,procurement-payroll,onyx-procurement/src/payroll/wage-slip-calculator.js,No negative net-pay guard; net_pay can go negative; no deduction-cap per ס׳ 25 חוק הגנת השכר,04
F073,MED,code-defect,procurement-payroll,onyx-procurement/src/payroll/wage-slip-calculator.js,YTD passed in but ignored by tax math; ytd field misleading (looks cumulative but computation independent),04
F074,MED,code-defect,procurement-payroll,onyx-procurement/src/payroll/wage-slip-calculator.js,Yisuf 3% surtax folded into 50% top bracket; kills audit trail for surtax; Form 126 needs separation,04,19
F075,MED,code-defect,procurement-payroll,onyx-procurement/src/payroll/wage-slip-calculator.js,study_fund_eligible derived from !!employee.study_fund_number; fragile; needs explicit study_fund_active boolean,04
F076,MED,runtime-config,payroll,payroll-autonomous/vite.config.js,Port 5174 in code vs CLAUDE.md 5173; cosmetic but trips reverse proxy,04,21
F077,MED,dependency,ai-task-manager,AI-Task-Manager/artifacts/erp-app/vite.config.ts,@assets alias points to AI-Task-Manager/attached_assets but folder not present (lives at worktree root); imports 404,05
F078,MED,runtime-config,ai-task-manager,AI-Task-Manager/artifacts/mockup-sandbox/vite.config.ts,PORT and BASE_PATH mandatory env (no defaults); local dev fails immediately,05
F079,MED,db-schema,supabase,89 critical columns,Missing CHECK constraints: status text columns without enum; numeric columns without non-negative check; tax_rate without 0-100 bound,09
F080,MED,db-schema,supabase,63 orphaned tables,Tables with no inbound or outbound FK; _temp_file_transfer dead; inventory and invoices duplicate inv_stock and ar_invoices/ap_invoices,09
F081,MED,db-rls,supabase,public.app_menu public.products,Anon-readable tables (only 2 left after 00071); confirm products should be authenticated-only,09
F082,MED,ui-rtl,multiple,techno-kol-ops + AI-Task-Manager/erp-app + erp-app,textAlign: left/right and marginLeft/Right and paddingLeft/Right literal directions; 23 files in techno-kol-ops 10 in erp-app,10
F083,MED,ui-rtl,erp-app techno-kol-ops,components,No <h1> on 9 techno-kol-ops pages incl Dashboard.tsx; heading-skip pattern; aria-label coverage 4/58 in erp-app shadcn ui,10
F084,MED,a11y,erp-mobile,AI-Task-Manager/artifacts/erp-mobile/app/_layout.tsx:33-36,I18nManager.forceRTL(true) called unconditionally and reloads; cannot toggle at runtime,10
F085,MED,docs,architecture,AI-Task-Manager/package.json + root,AI-Task-Manager is parallel pnpm monorepo embedded inside npm monorepo; lockfile and PM drift unmanaged,15,05
F086,MED,docs,architecture,_merge-staging/ _merge-staging-final/ _merge-incoming/ docs/merged-final/CLAUDE.md,Merge-staging artifacts and stale duplicate CLAUDE.md should not be in git/main,15
F087,MED,docs,architecture,test/payroll/*.test.js,Root-level tests reach into onyx-procurement/src; coupling root test tree to procurement internals,15
F088,MED,spec-drift,state-machines,onyx-procurement/src/pipeline/{state-machines.js entity-map.js},Entity-map ↔ SM coverage gaps: customer/supplier/material in EM but no SM; attendance/payroll in SM but no EM,16
F089,MED,missing-impl,state-machines,onyx-procurement/src/pipeline/state-machines.js,No guard layer; all gating in orchestrator preconditions only; 91-transitions claim implies guards exist (do not),16
F090,MED,pwa,multiple,erp-app payroll-autonomous techno-kol-ops onyx-procurement onyx-ai,Missing viewport-fit=cover on web index.html entries; iPhone notch safe-area insets resolve to 0,17
F091,MED,pwa,multiple,erp-app techno-kol-ops payroll-autonomous,No browserslist pinned; Vite default targets are implicit; iOS 13.x users (~3% IL base) get white screen,17
F092,MED,a11y,onyx-procurement,onyx-procurement/web,No PWA shell; field workers (construction sites) need offline RFQ queueing per existing QA-AGENT-68,17,20
F093,MED,a11y,erp-mobile,mobile-app/App.tsx,No I18nManager.forceRTL(true) call; on Android RN forces RTL only if device locale is Hebrew,17
F094,MED,il-compliance,procurement-payroll,onyx-procurement/src/payroll/wage-slip-calculator.js,Income-tax brackets BL thresholds max insurable נקודת זיכוי all marked ESTIMATED; verify against ילקוט פרסומים Dec 2025/Jan 2026,19,04
F095,MED,il-compliance,test-fixtures,test/fixtures/invoices.js + test/seed/israeli-seed.test.js + qa-08-rfq-quotes.test.js:29 + vat-routes.test.js:302,Tests still hard-code vat_rate 0.17 in current-period tests; should drive off getVatRateForDate(invoice_date),19
F096,MED,il-compliance,procurement-payroll,onyx-procurement,Hours register / timesheet engine planned but currently manual; required for חוק שעות עבודה ומנוחה inspection,19
F097,MED,il-compliance,procurement-payroll,onyx-procurement,Section 14 (pension severance designation) handled as manual flag; no contract-side enforcement; needs boolean section_14 on employees,19
F098,MED,ci-cd,deploy,docker/{4 Dockerfiles},No image labels for OCI metadata (org.opencontainers.image.source revision created); deploy.yml has metadata-action but per-Dockerfile LABEL absent,20
F099,MED,ci-cd,deploy,docker/onyx-ai.Dockerfile,Installs python3 make g++ in deps stage and never removes; final image bloated ~150MB,20
F100,MED,ci-cd,deploy,.dockerignore,No .dockerignore audited; _qa-reports/ _audit_tmp/ _delivery/ _merge-staging*/ node_modules .git *.env may leak into images,20,167
F101,MED,ci-cd,deploy,.github/workflows/deploy.yml,No SBOM (syft) generation no image signing (cosign) no vuln scan (Trivy/Grype); GHCR images unsigned,20,167
F102,MED,security,observability,onyx-procurement/src/ops/error-tracker.js,SENTRY_DSN read but @sentry/node not in deps; placeholder confusion,20
F103,MED,ci-cd,deploy,onyx-procurement/scripts/migrate.js,DOWN sections optional; no CI lint validating presence,20
F104,MED,runtime-config,techno-kol-ops,techno-kol-ops/package.json,start runs node dist/index.js with no prestart build; dist not committed; requires manual npm run build,21
F105,MED,missing-impl,pipeline-engine,onyx-procurement/src/pipeline/pipeline-engine.js,Trigger handler is a stub: builds {action status:queued message} strings; never calls orchestrator; CLAUDE.md says POST /api/orchestrator/execute is executor,26
F106,MED,code-defect,pipeline-engine,onyx-procurement/src/pipeline/pipeline-engine.js,No bridge from stage advance to event; advancing pipeline_item to procurement does not fire project_in_procurement,26
F107,MED,code-defect,pipeline-engine,onyx-procurement/src/pipeline/pipeline-engine.js,Missing actor middleware; req.actor used at L424 427 457 461 514 517 but no middleware sets it; falls back to api,26
F108,MED,code-defect,pipeline-engine,onyx-procurement/src/pipeline/pipeline-engine.js,/api/pipeline/health hardcodes localhost; cross-service checks broken in container/Docker; payroll.status faked as up,26
F109,MED,missing-impl,entity-map,onyx-procurement/src/pipeline/entity-map.js,6 thin entities with <=2 actions: contract material payment task document alert; contradicts 360-page contract,27
F110,MED,spec-drift,entity-map,onyx-procurement/src/pipeline/entity-map.js,~70 broken links in entity-map: links arrays reference entities not declared (crm_activity message sales_opportunity supplier_quote vat tax bank_match etc); 404 on /api/entity-map/:type,27
F111,MED,spec-drift,entity-map,onyx-procurement/src/pipeline/entity-map.js,Plural/singular drift: relatedSections (tasks leads quotes etc) vs links (singular task lead quote); UI joiner risk,27
F112,MED,missing-impl,entity-map,onyx-procurement/src/pipeline/entity-map.js,No kpis/metrics block per entity; 360 dashboards (Customer360 Supplier360 Project360) need synthetic computation,27
F113,MED,code-defect,entity-map,onyx-procurement/src/pipeline/entity-map.js,Missing enums: alert.severity (in topField but not statuses); invoice.direction (incoming/outgoing) topField but no enum; task/document.parent_entity untyped,27
F114,MED,missing-impl,workflow-flows,onyx-procurement/src/pipeline/workflow-flows.js,No deep-freeze on WORKFLOW_FLOWS export; consumers can mutate; no module-load validation,28
F115,MED,missing-impl,workflow-flows,onyx-procurement/src/pipeline/workflow-flows.js,/api/workflows/:id returns 404 plain text; no machine-readable error code; no validIds list,28
F116,MED,code-defect,state-machines,onyx-procurement/src/pipeline/state-machines.js,4 entities ship empty triggers blocks (employee task document alert); no comment explains; coverage 30/115 transitions ~26%,29
F117,MED,code-defect,state-machines,onyx-procurement/src/pipeline/state-machines.js,triggers keyed with → char (U+2192); fragile; callers building keys with -> ASCII or > silently get [],29
F118,MED,missing-impl,state-machines,onyx-procurement/src/pipeline/state-machines.js,No applyTransition helper that audits/persists; CLAUDE.md says every transition is audited but file does not implement audit,29
F119,MED,spec-drift,wiring-spec,onyx-procurement/src/pipeline/wiring-spec.js,Path inconsistency: supplier.send_rfq (L221) posts /api/rfq/send (no :id) vs rfq.send_to_suppliers /api/rfq/:id/send,30
F120,MED,spec-drift,wiring-spec,onyx-procurement/src/pipeline/wiring-spec.js,Cross-service gaps: no ops→ai no payroll→ops no payroll→ai no ai→payroll no procurement→payroll; ops→ai gap notable,30
F121,MED,code-defect,orchestrator,onyx-procurement/src/pipeline/orchestrator.js,navigate placeholder :newId never substituted; e.g. /entity360.html?type=quote&id=:newId returned literally,31
F122,MED,missing-impl,orchestrator,onyx-procurement/src/pipeline/orchestrator.js,Master Flow closure gaps: no delivery.dispatch no project.close no supplier-invoice ingest no rfq.create_from_project actions,31
F123,MED,missing-impl,finance360,erp-app/src/pages/finance/,Adjacent richer pages exist (payables-dashboard payment-operations revenue-tracking etc) but not surfaced as Finance360 tabs,48
F124,MED,spec-drift,shared-workflows,packages/shared-workflows/machines.js,Per-entity drift on lead quote po project work_order: extra states + renamed transitions + lost canonical paths,60
F125,MED,missing-impl,shared-workflows,packages/shared-workflows/machines.js,Triggers/effects map dropped from package; package validates transitions but executes no side-effects defeating purpose,60
F126,MED,ci-cd,workflows,.github/workflows/*.yml,Action versions pinned to major (v4 v7) not SHA; supply-chain risk; no Dependabot for github-actions,167
F127,MED,ci-cd,workflows,.github/workflows/security.yml,Step Run npm audit (high) named for high but uses --audit-level=critical; only critical CVEs fail,167
F128,MED,ci-cd,workflows,.github/workflows/deploy.yml,Same docker prefix erp-2026 regardless of branch; no env-scoped tagging staging vs prod; latest tag race when main+master both push,167
F129,MED,ci-cd,workflows,.github/workflows/deploy-preview.yml,Preview URL is hardcoded TBD placeholder; job name Deploy Preview is misleading; no actual preview hosting,167,20
F130,MED,ci-cd,workflows,.github/workflows/security.yml,No Dependabot config no actions/dependency-review-action no secret-scanning workflow no Trivy/container scan,167
F131,MED,security,onyx-ai,agents/package.json:12,@workspace/db workspace alias not configured at this level; standalone install fails on @workspace/db,03,05
F132,MED,docs,architecture,workspaces nexus_engine paradigm_engine,Listed in root workspaces but no service imports them; appear parked/experimental; not documented in CLAUDE.md,15
F133,MED,db-rls,supabase,public.api_keys public.env_variables public.webhooks public.tax_rules public.user_integrations public.tenant_integrations public.analytics_events public.system_logs,8 secret/telemetry tables RLS DISABLED — particularly dangerous,09
F134,LOW,code-defect,onyx-ai,agents/src/llm/client.ts:6,process.env.ANTHROPIC_API_KEY!; non-null assertion on potentially undefined env,03
F135,LOW,docs,onyx-ai,onyx-ai/tsconfig.json,Strict TS not green; noImplicitAny noUnusedLocals noUnusedParameters disabled; TYPESCRIPT_STRICT_PLAN.md steps 1-7 not done,03
F136,LOW,code-defect,procurement-payroll,onyx-procurement/src/payroll/wage-slip-calculator.js + payroll-autonomous/src/App.jsx,Currency symbol mismatch ₪ vs ₪ literal escape; rounding inconsistency between agorot and shekel; pick one,04
F137,LOW,code-defect,procurement-payroll,onyx-procurement/src/payroll/wage-slip-calculator.js,Overtime multipliers hard-coded inline (1.25 1.50 1.75 2.00); should pull from OVERTIME_RATES constant,04
F138,LOW,security,procurement-payroll,onyx-procurement,process.env.NODE_ENV === development && AUTH_MODE === disabled => admin bypass; should be build-time flag never read at runtime in non-dev images,04
F139,LOW,db-schema,supabase,wage_slips,No timesheet table; per-day breakdown not retained for audit; sick day misclassification cannot be reconstructed,04
F140,LOW,db-schema,supabase,employees.base_salary,One column for monthly+hourly+daily+freelance; needs split or discriminator,04
F141,LOW,dependency,ai-task-manager,AI-Task-Manager/.npmrc,minimumReleaseAge: 1440 quarantines newly-published versions; CI may fail when fresh patch ships,05
F142,LOW,dependency,ai-task-manager,kobi-agent vs lib/integrations-anthropic-ai,@anthropic-ai/sdk major skew (0.30.0 vs 0.78.0); Express skew (4 vs 5); @types/node skew (^20.11.0 vs catalog ^25.3.3),05
F143,LOW,dependency,ai-task-manager,artifacts/erp-mobile,@types/react drift from catalog (~19.1.10 vs ^19.2.0); Expo SDK 54 ships own floor; intentional but risks two type versions,05
F144,LOW,db-schema,supabase,ap_invoices ar_invoice_lines proc_po_lines tax_rate numeric(5 2),Tax precision conflict; no >=0 AND <=100 enforced; migration 00037 changed VAT to 18% but added no constraint,09
F145,LOW,ui-rtl,erp-mobile,login.tsx ai-chat.tsx chat.tsx approvals.tsx WmsScanner.tsx VoiceFab.tsx,textAlign=right per-input (22 occurrences); ignores RN writingDirection API,10
F146,LOW,ui-rtl,erp-app,index.css fonts via Google Fonts,Hebrew web fonts loaded from Google Fonts at runtime via @import; blocks first paint; no font-display: swap; fails offline,17
F147,LOW,ui-rtl,erp-app techno-kol-ops,no responsive logic,No xs:/360px breakpoint for compact phones (Galaxy A iPhone SE); older Hebrew test devices affected,17
F148,LOW,ui-rtl,techno-kol-ops,client/src,18 i18n matches but all are local string keys not translation; no shared button component; buttons remain visually identical when disabled (WCAG 1.4.1),10
F149,LOW,il-compliance,procurement-payroll,onyx-procurement,Form 106 distribution to employees manual (no automated email/portal push),19
F150,LOW,il-compliance,procurement-payroll,onyx-procurement,Allocation-number (Invoice Reform 2024) threshold hard-coded; no per-period override,19
F151,LOW,il-compliance,procurement-payroll,onyx-procurement,No automated re-verification job for tax constants; only documented Jan 1/Apr 1 cadence,19
F152,LOW,il-compliance,procurement-bank,onyx-procurement/src/validators/iban.js + masav-exporter.js,Bank-Yahav code 4 single digit in IBAN registry vs 04 in Masav; cross-validate padding consistency,19
F153,LOW,docs,deploy,Dockerfile root,Root Dockerfile is for techno-kol-ops only (port 3200); counter-intuitive; CI consumers may pick up wrong file,20
F154,LOW,ci-cd,deploy,docker/payroll-autonomous.Dockerfile,Inline printf for nginx config; no SSL/TLS termination no security headers; needs proxy in front,20
F155,LOW,ci-cd,deploy,onyx-procurement/server.js + others,No /ready vs /live readiness/liveness split; deep DB-connect readiness missing,20,21
F156,LOW,ci-cd,workflows,.github/workflows/ci.yml,unit-tests job redundant with build-test (same npm test per project) and re-installs from scratch (no cache); wasted minutes,20,167
F157,LOW,docs,observability,docker-compose.yml + docker-compose.prod.yml,No central log shipping in compose; Loki wired in prod but no Promtail config; Grafana datasource provisioning not in repo,20
F158,LOW,docs,deploy,nexus_engine paradigm_engine,Single-region everywhere; no read-replicas no Sentinel/cluster no CDN no documented warm-standby in second IL AZ,20
F159,LOW,runtime-config,onyx-ai,onyx-ai/package.json,No @supabase/supabase-js declared but src reads SUPABASE_URL/ANON_KEY via raw fetch; works for /readyz but blocks any future createClient code,21,03
F160,LOW,code-defect,pipeline-engine,onyx-procurement/src/pipeline/pipeline-engine.js,No try/catch around supabase.insert(...).select() at L453 L508; rejected promises leak to handler,26
F161,LOW,code-defect,pipeline-engine,onyx-procurement/src/pipeline/pipeline-engine.js,ENTITY_PAGES.po.relatedEntities references delivery_notes which has no entity row in ENTITY_RELATIONS and no menu link,26
F162,LOW,docs,workflow-flows,onyx-procurement/src/pipeline/workflow-flows.js,Inconsistent step granularity (5/5/4/4/4); no rationale; flow 3 should arguably be 6+,28
F163,LOW,docs,workflow-flows,onyx-procurement/src/pipeline/workflow-flows.js,No flow-level metadata (id version owner slaHours kpi priority status); object key as id; routes return object not array,28
F164,LOW,code-defect,workflow-flows,onyx-procurement/src/pipeline/workflow-flows.js,Step number is a property not enforced; nothing validates uniqueness/monotonicity/duplicates,28
F165,LOW,code-defect,state-machines,onyx-procurement/src/pipeline/state-machines.js,lead has dead trigger entries new→contacted: [] and contacted→qualified: [] (empty arrays); harmless but noisy,29
F166,LOW,docs,state-machines,onyx-procurement/src/pipeline/state-machines.js,work_order qa is both state name and transition name (in_progress.transitions.qa: qa); legal but readability hazard,29
F167,LOW,docs,wiring-spec,onyx-procurement/src/pipeline/wiring-spec.js,Page-contract key naming workOrder360 camelCase outlier vs others; consumer must normalize on read,30
F168,LOW,missing-impl,wiring-spec,onyx-procurement/src/pipeline/wiring-spec.js,No JSDoc count comments at section headers; future audits cannot self-verify; recommend self-check function at module load,30
F169,LOW,code-defect,orchestrator,onyx-procurement/src/pipeline/orchestrator.js,Effect schemas mix two field shapes: fields:[a b] vs fields:{a::val}; document the disambiguation,31
F170,LOW,code-defect,orchestrator,onyx-procurement/src/pipeline/orchestrator.js:292-295 + 286,Audit effect duplicated by audit hook; could lead to double-write once effects are real,31
F171,LOW,docs,orchestrator,onyx-procurement/src/pipeline/orchestrator.js:334,console.log uses unicode checkmark; may render oddly on Windows cp1252 terminals,31
F172,LOW,docs,orchestrator,onyx-procurement/src/pipeline/orchestrator.js,service: dynamic on alert.resolve undocumented in CLAUDE.md 4-service table,31
F173,LOW,missing-impl,finance360,_merge-staging-final/.../Finance360.tsx,Stale merge copies (3 files) should be excluded from build to eliminate drift,48
F174,LOW,code-defect,finance360,techno-kol-ops/client,bank_match_status literal unmatched color mapping (currently green via fallback) — verify in badgeClass,48
F175,LOW,docs,ci-cd,.github/workflows/ci.yml,Lint step is continue-on-error: true so lint regressions are invisible,167
F176,INFO,docs,onyx-ai,onyx-ai/src/{procurement-bridge.ts integrations.ts security.ts health.ts},Solid template code: AbortController timeouts retry+exponential-backoff X-API-Key fail-open SHA-256 timingSafeEqual; just need to be wired,03
F177,INFO,docs,procurement-payroll,onyx-procurement/src/payroll/wage-slip-calculator.js,Frontend payroll-autonomous is structurally clean Vite SPA with PWA manifest RTL+Hebrew dark theme; cannot produce wrong payslip alone,04
F178,INFO,docs,ai-task-manager,AI-Task-Manager,onlyBuiltDependencies allowlist gates postinstall scripts (safe default); native-binary overrides save install time; security pins on path-to-regexp picomatch serialize-javascript node-forge,05
F179,INFO,docs,db-rls,supabase/migrations/00068_..._00071_..._sql,Hardening migrations 00068-00071 only addressed 24 policies inside execution.* finance.* inventory.* intelligence.*; tip of the iceberg vs 318 always-true policies,09
F180,INFO,docs,architecture,packages/erp-upload + packages/technokoluzi-erp,Two packages with conflicting names (technokoluzi-erp vs techno-kol-uzi); reconcile,15
F181,INFO,docs,state-machines,packages/shared-workflows/machines.js,Payment Payroll Attendance machines clean — naming-only drift,60
F182,INFO,docs,event-bus,onyx-procurement/src/wiring/event-bus.js,Bus exists and works (test/wiring/event-bus.test.js); 5 cross-service consumers run via domain-events.js; only orchestrator integration is missing,79
F183,INFO,docs,ci-cd,.github/workflows/security.yml,CodeQL configured for javascript-typescript with security-and-quality queries (fine defaults),167
F184,INFO,docs,architecture,onyx-procurement/scripts/migrate.js,Custom migration runner is production-grade: SHA-256 checksums drift detection advisory lock per-run log --up/--down/--status/--dry-run/--force/--json; UP/DOWN sections per file,20
```

---

## 3. Top-priority CRIT clusters (recommended order of attack)

1. **DB / RLS hardening** (F004-F006, F027-F030, F133): 59 tables RLS-disabled, 318 always-true policies, no tenant isolation in effect — single biggest production risk. Migrations M1-M82 already drafted in AGENT-09.
2. **Pipeline + orchestrator wiring** (F009-F012, F042, F053, F061): the entire `/api/wiring/*`, `/api/orchestrator/*`, `/api/pipeline/*` blueprint is a scaffold. WorkOrder360 and any 360 page action button 404s. Fix: register routes in `server.js`, implement transition executor, wire orchestrator → event-bus.
3. **onyx-ai runtime** (F001-F003, F007-F008, F015-F020): wrong file boots, no dotenv, three platform copies, port chaos, security modules dead. 30-minute fix to `require('./onyx-platform')` + endpoint port unblocks the procurement → AI integration.
4. **IL payroll compliance** (F013-F014, F021-F025, F094): bracket constants ESTIMATED + sick-pay flat 50% + naive YTD + allowance taxability + BL rounding. Block production payroll runs until resolved.
5. **RTL root direction** (F007, F031, F033): one-line HTML fix for `erp-app`, then codemod logical properties.

---

## 4. Bucket → file hot-spots

| Hot file | Findings |
|----------|---------:|
| `onyx-procurement/src/pipeline/orchestrator.js` | 11 |
| `onyx-procurement/src/payroll/wage-slip-calculator.js` | 13 |
| `onyx-ai/src/index.ts` (and onyx-platform.ts/onyx-integrations.ts) | 14 |
| `onyx-procurement/src/pipeline/pipeline-engine.js` | 8 |
| `onyx-procurement/src/pipeline/state-machines.js` | 8 |
| `onyx-procurement/src/pipeline/entity-map.js` | 5 |
| `onyx-procurement/src/pipeline/workflow-flows.js` | 7 |
| `packages/shared-workflows/machines.js` | 5 |
| Supabase RLS / schema (public.*) | 11 |
| `.github/workflows/*.yml` | 12 |
| Docker/deploy infra | 11 |
| `erp-app/index.html` + RTL surfaces | 8 |
| `AI-Task-Manager/artifacts/{api-server,erp-app,mockup-sandbox,erp-mobile}` | 9 |

---

## 5. Dedupe notes

- Port-collision (onyx-ai 3200/3300) reported in AGENT-03, 15, 21, 16 → folded to F008/F015.
- 12-listener / orchestrator wiring gap reported in AGENT-16 and AGENT-79 → folded to F010 / F061 with both sources.
- 13/91 vs 15/115 state-machines drift in AGENT-16 and AGENT-29 → folded to F039.
- /api/wiring blueprint missing in AGENT-15 and AGENT-26 → folded to F009.
- RTL root on erp-app/index.html in AGENT-10 and AGENT-17 → folded to F007/F031.
- /healthz vs /health drift in AGENT-20 and AGENT-21 → folded to F046.
- VAT 0.17 in test fixtures in AGENT-19 → consolidated as F095 with concrete file list.
- Payroll port 5174 vs 5173 in AGENT-04 and AGENT-21 → folded to F076.
- main vs master branch trigger in AGENT-167 → F064.
- Strict TS plan not done (AGENT-03) kept as single F135.
- `entrypoint.js` canned health response (AGENT-03) merged into F069.

---

## 6. Untouched areas (no AGENT-* report yet)

(Inferred from numbering gaps; not findings.) Agents 01-02, 06-08, 11-14, 18, 22-25, 32-47, 49-59, 61-78, 80-166, 168-194, 196+ are absent from this batch. The aggregate covers operations / runtime / DB / pipeline / IL-compliance / UI-RTL / deploy / CI but does NOT cover end-to-end e2e tests, onyx-procurement business modules, or AI engine internals beyond the orchestrator.
