# AGENT-197 — Effort Estimation for QA Findings

**Date:** 2026-04-29
**Source:** 20 reports in `_qa-reports-25/` (AGENT-03 through AGENT-79)
**Buckets:** XS = under 1hr, S = 1-4hr, M = 4-8hr, L = over 1 day (8hr+)

## Summary

| Bucket | Count | Hours est. |
|--------|------:|-----------:|
| XS (<1hr) | 38 | ~22 hr |
| S (1-4hr) | 71 | ~180 hr |
| M (4-8hr) | 39 | ~230 hr |
| L (>1d) | 22 | ~430 hr |
| **Total** | **170** | **~860 hr (~108 dev-days)** |

## AGENT-03 onyx-ai (15)
XS: dotenv import; pin port 3300 in 4 files; 1MB readBody cap; delete onyx-integrations.ts; remove canned entrypoint.js responses; whitelist policy case in evaluatePolicy.
S: INSTRUCTIONS_TO_WIRE.md (auth+health); persist rate-limiter; smoke tests for /livez/evaluate/budget; EventStore.append signature unify; sanitize error.message; agents/ workspace alias.
M: Pick canonical platform file + port endpoints; wrap Anthropic/OpenAI in retry+CB.
L: Strict TS migration (noImplicitAny -> noUnusedLocals).

## AGENT-04 payroll (14)
XS: vite port 5173; OVERTIME_RATES from constants; ₪ symbol ESLint; dev admin bypass build flag; floor-to-agora BL rounding.
S: Sick-pay ladder 0/50/100; deduction-cap §25 + non-negative net; track יסף 3% separately; study_fund_active boolean+migration; vitest SPA-API contract fixtures.
M: YTD income-tax true-up; שווי allowance exemptions; split base_salary monthly/hourly + migration.
L: Integer-agorot pipeline (system-wide).

## AGENT-05 AI-Task-Manager (7)
XS: Resolve duplicate `@workspace/integrations-anthropic-ai`; fix attached_assets alias; default PORT/BASE_PATH in mockup; align erp-mobile @types/react; align kobi-agent @types/node; engines.node; pnpm-lock diff check.

## AGENT-09 DB integrity (11 migrations)
S: governance.current_tenant_id() helper; index 29 tenant_id columns; policies for 5 platform_* tables; fix WITH CHECK NULL on insert policies; drop orphaned legacy tables.
M: 167 missing FK indexes (CONCURRENTLY); 89 CHECK constraints.
L: tenant_id column + backfill on 57 child tables; harden 26 public.* domain RLS; harden 22 schema-qualified domain RLS; enable RLS + policies on 59 unprotected tables.

## AGENT-10 UI RTL (9)
S: dir="rtl" on erp-app + drop wrappers; add `<h1>` to 9 pages + axe-core; useRTL() hook for erp-mobile; contrast token swaps.
M: Logical properties codemod (border/margin/padding/textAlign/inset); `<Bdi>` helper + wrap top-4 pages; port unified-states.tsx to techno-kol-ops; aria-label coverage on 58 components.
L: react-i18next + locales/he.json + codemod 250+ files.

## AGENT-15 architecture (10)
XS: Fix ONYX_AI port (3200->3300); remove _merge-staging*; delete docs/merged-final CLAUDE.md duplicate.
S: Add package.json to 8 shared-* packages; resolve npm-vs-pnpm; move root tests into services; document/remove nexus_engine/paradigm_engine.
M: Wire 6 pipeline APIs in server.js; decide payroll ownership + delete duplicate; adopt shared packages in 3 services.

## AGENT-16/29 state machines (8)
XS: Sync spec to "15/115"; fix 3 orchestrator preconditions (in_production/decided/done); remove dead state quote.deleted; add attendance/payroll to entity-map.
S: Add `material` SM; guards layer per machine.
M: Wire POST /api/state-machines/:type/transition + audit; register 12 missing listeners.

## AGENT-17 compatibility (15)
XS: dir="rtl" on erp-app; viewport-fit=cover (4 entries); replace body{direction:rtl}; Apple-mobile-web-app meta; font-display: swap; I18nManager.forceRTL(true); xs:360px breakpoint.
S: Wire vite-plugin-pwa (2 services); pin browserslist + build.target; self-host Hebrew fonts; text-align: end replacements; Lighthouse CI gate.
M: Convert 15 erp-app pages to logical props; `<bdi>` for mixed Hebrew+Latin.
L: onyx-procurement PWA shell.

## AGENT-19 IL compliance (10)
XS: Bank-Yahav code padding consistency.
S: Verify ESTIMATED constants vs ילקוט פרסומים; getVatRateForDate() in test fixtures; allocation-number per-period override; section 14 enforcement; scheduled tax-constants verification job.
M: PCN874 builder; Form 106 distribution automation.
L: Hours register/timesheet engine.

## AGENT-20 deploy/CI (15)
XS: Fix onyx-procurement Dockerfile npm ci branch; dedupe unit-tests in ci.yml.
S: Standardize /healthz; .dockerignore audit; pino.redact in 3 services; Trivy/Grype scan; Sentry SDK decision; enforce DOWN sections + lint.
M: Wire migrations into deploy.yml; cosign + syft SBOM; real Cloud Run/Railway deploy + smoke; OpenTelemetry traceparent.
L: External Secrets Operator + Secret Manager; canary lane; multi-region warm-standby.

## AGENT-21 smoke (7)
XS: onyx-ai PORT default 3300; payroll port 5173; prestart:build for techno-kol-ops; @supabase/supabase-js in onyx-ai; QUICKSTART.md.
S: AI-Task-Manager api-server PORT default + Node start script; npm run smoke:all.

## AGENT-26 pipeline-engine (8)
XS: Drop delivery_notes from po.relatedEntities; service URLs from env in /api/pipeline/health.
S: Migration for pipeline_items/transitions/events; emit events on stage advance; validate transitions vs SM; actor middleware; try/catch wraps on DB writes.
M: Wire trigger executor to orchestrator.execute.

## AGENT-27 entity-map (10)
XS: Severity enum on alert; direction enum on invoice; fix project logistics_order mismatch; __contractVersion field.
S: external:true flag for 70+ refs; 6 thin entities to >=4 actions; normalize plural relatedSections; typed parent_entity schema; per-entity kpis:[] block; unit test for link integrity.

## AGENT-28 workflow-flows (14)
XS: Deep-freeze export; JSON 404 with validIds list.
S: Add Order step or remove from spec; reconcile 5 missing entities; standardize action names; add Delivery+Closure steps; vat_period.close step; flow metadata; module-load validation; bank_match SM; wire results[] to bus; Approval entity in Flow 1.
M: Add entry/exits/errorStates schema (5 flows); map every step to orchestrator action (13 missing).

## AGENT-30 wiring-spec (5)
XS: Reconcile /api/rfq/send paths; document cross-service gaps; normalize page-contract keys; JSDoc count comments.
S: Self-check function at module load.

## AGENT-31 orchestrator (10)
XS: Document field-shape disambiguation; replace unicode checkmark; document service:'dynamic'.
S: Substitute :newId placeholder; add rfq.create_from_project; resolve audit double-write.
M: Enforce preconditions at runtime; publish events[] to bus; add delivery.dispatch + project.close + supplier_invoice.
L: Execute effects (real APIs not stubs).

## AGENT-48 finance360 (8)
XS: Fix bank_match_status color mapping; remove _merge-staging-final copies.
S: Wire 5 primary action buttons.
M: Rename FinanceControlRoom + Invoice360 + new Finance360; add 3 missing widgets; embed existing erp-app/finance/* as tabs.
L: Add 8 missing tabs; implement /api/finance/{gl,ap-summary,cashflow,budget,costing,exports}.

## AGENT-60 shared-workflows (7)
S: Standardize on snake_case; fix Task/Alert shapes; move WORKFLOW_FLOWS into package; reconcile workflow-step actions.
M: Pick single source of truth + codegen; restore triggers/effects map; add employee/contract/document machines.

## AGENT-79 event bus (1)
M: Wire orchestrator.events to emitDomainEvent + register 12 listeners.

---

## Critical-path P0 (~44hr / ~5.5 dev-days)

If only one sprint-week is available, ship these to unblock the rest:

1. **AGENT-03 R1+R2** — canonical platform file + dotenv (~5hr). Unblocks procurement->AI bridge (current 404 storm).
2. **AGENT-15 P0-1+2** — wire 6 pipeline APIs + fix ONYX_AI port (~5hr). WorkOrder360 click works, no port collision.
3. **AGENT-09 M1+M2+M4** — tenant helper + FK indexes + tenant_id indexes (~12hr). Prerequisite for any RLS hardening.
4. **AGENT-31 H1+H2** — enforce preconditions + execute effects (~16hr). Orchestrator becomes a real engine instead of returning stubs.
5. **AGENT-79** — wire bus (~6hr). 12 AI listeners come online.

Everything else (RLS hardening across 244 tables, i18n codemod, finance360 tabs) is multi-sprint work and should be sequenced behind these unblocks.

## Caveats

- Estimates assume one mid-senior dev familiar with the codebase. Multi-day items (L) are calendar days, not man-hours.
- Migrations on production (AGENT-09) require off-hours windows; calendar overhead not in numbers.
- Cross-cutting items overlap (e.g. sick-pay ladder appears in AGENT-04 and AGENT-19); deduplicated above.
- AGENT-30 wiring-spec is structurally PASS — only polish, not blockers.
