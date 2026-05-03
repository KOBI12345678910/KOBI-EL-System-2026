# AGENT-269 — ARCH #4: Observability Strategy

**Agent:** 269 (ARCH #4) | **Date:** 2026-04-29 | **System:** Techno-Kol Uzi ERP 2026
**Scope:** Structured logging (pino), metrics (Prometheus), traces (OpenTelemetry), audit, alerting

---

## 1. Executive Summary

The platform spans **4 services** (TECHNO_KOL_OPS, ONYX_PROCUREMENT, PAYROLL_AUTONOMOUS, ONYX_AI) with a meaningful logging/metrics base already in place (pino + zero-dep Prom exporter + APM ring buffers + Hebrew-bilingual alert rules + governance.audit_logs table). The two material gaps are **distributed tracing** (no OpenTelemetry instrumentation despite the system being multi-service) and **cross-service log/metric correlation** (request_id is propagated by middleware but is not stamped onto governance.audit_logs rows nor onto metric exemplars). Closing those two gaps takes the stack from "service-local visibility" to "Palantir-grade end-to-end traceability".

**Health rating of current observability:** 6/10. Solid foundations, missing the connective tissue.

---

## 2. Current State Inventory

### 2.1 Structured Logging
| Asset | Location | Status |
|---|---|---|
| Pino logger (singleton) | `onyx-procurement/src/logger.js` | OK — pino@9.5, JSON in prod, pretty in dev, redacts auth/cookie/token paths |
| Zero-dep structured logger | `onyx-procurement/src/ops/logger.js` | OK — Asia/Jerusalem ISO-8601, AsyncLocalStorage correlation, ת.ז + Luhn + IBAN PII redaction, file/HTTP/console transports, rotation hook |
| Express middleware | both files | OK — `correlationId()` mints x-request-id, `requestLogger()` wraps req/res |
| CLI / boot loggers | `onyx-procurement/src/cli/logger.js`, `src/ops/logger.js` | Duplication — see Gap 4.1 |
| K8s log aggregation | `k8s/19-loki.yaml` | OK — Loki deployed |

### 2.2 Metrics (Prometheus)
| Asset | Location | Status |
|---|---|---|
| Zero-dep prom exporter | `onyx-procurement/src/ops/prom-metrics.js` | OK — Counter/Gauge/Histogram/Summary/Info, validates names, default Node metrics, ERP seed metrics (`erp_http_requests_total`, `erp_http_request_duration_seconds`, `erp_invoices_created_total`, `erp_wage_slips_generated_total`, `erp_db_query_duration_seconds`, `erp_queue_size`, `erp_cache_*`) |
| Legacy metrics module | `onyx-procurement/src/ops/metrics.js` | Coexists — prefixes `http_*`, `payroll_slips_generated_total`, `vat_exports_total` (different from prom-metrics.js). See Gap 4.2 |
| APM (ring-buffer) | `onyx-procurement/src/ops/apm.js` | OK — P50/75/90/95/99, Apdex, healthScore 0-100, top-N slow routes/queries, optional event-loop / GC / CPU monitors via PerformanceObserver |
| K8s Prometheus + Grafana | `k8s/17-prometheus.yaml`, `k8s/18-grafana.yaml` | OK — deployed, Recreate strategy, NetworkPolicy in place |
| Python metrics exporter | `enterprise_palantir_core/app/engines/metrics_exporter.py` | OK — for Palantir core engines |

### 2.3 Tracing
| Asset | Location | Status |
|---|---|---|
| `trace_id` field on logs | `src/ops/logger.js` | Half-implemented — header is read (`x-trace-id`), surfaced into log events, but **never generated and never propagated outbound** to downstream HTTP / DB calls |
| OpenTelemetry SDK | none | **MISSING** — no `@opentelemetry/*` deps in `onyx-procurement/package.json` |
| Span creation | none | **MISSING** |
| Trace backend (Jaeger/Tempo) | none in `k8s/` | **MISSING** |

### 2.4 Audit
| Asset | Location | Status |
|---|---|---|
| `governance.audit_logs` table | `supabase/migrations/00000_master_schema.sql:133` | OK — entity_type, entity_id, action_name, old_values/new_values JSONB, performed_by_user_id, source_service, source_module, source_page, **correlation_id (text)**, performed_at |
| Indexes | same migration | OK — by entity, by performed_at desc |
| Attachments | `00010_enterprise_expansion_30_tables.sql:727`, `00059_governance_domain_complete.sql:494` | OK — audit_log_attachments table |
| Audit writer integration | scattered across `wiring/event-bus.js`, `dsr-handler.js`, `tos-tracker.js`, `dead-letter-queue.js`, `pipeline/*` | Partial — no central audit writer; correlation_id column exists but isn't reliably populated from AsyncLocalStorage |

### 2.5 Alerting
| Asset | Location | Status |
|---|---|---|
| Prometheus rules (4 groups, ~7 alerts) | `onyx-procurement/ops/alerts/rules.yml` | OK — HighErrorRate, SlowDBQueries, HighMemoryUsage, LowDiskSpace, FailedWebhookDeliveries, MissingDailyBackup, PayrollGenerationFailures, VATExportFailure — all bilingual he/en |
| Alertmanager dispatcher | `onyx-procurement/ops/alerts/notification-dispatcher.js` | OK — STDIN + HTTP receiver modes, severity routing matrix (critical→whatsapp+sms+email, warning→email, info→file) |
| Runbook URLs | embedded in rules.yml | URLs point to `runbooks.onyx-procurement.local/alerts/...` — verify the runbook host actually exists |

---

## 3. Target State

### 3.1 Logging Target
- **One** logger surface (`@onyx/logger`) re-exporting pino as the runtime backend, with the zero-dep `src/ops/logger.js` kept as the **air-gapped fallback** behind a single feature flag (`OBS_DEPS=full|stdlib`).
- Every log event includes: `service`, `env`, `version`, `host`, `request_id`, `trace_id`, `span_id`, `tenant_id`, `user_id`. The 4 services emit identical schemas → Loki labels are consistent across all of them.
- Log → trace linking via `trace_id` so a single Grafana click jumps from a Loki line to the matching Tempo span.
- Sampling: 100% warn/error/fatal, 10% info in prod, 1% debug, 0% trace by default.
- Retention: hot 7d (Loki SSD), warm 30d (Loki object store), cold 365d (S3-compatible WORM bucket — required for Israeli Tax Authority audit defensibility).

### 3.2 Metrics Target
- Consolidate `src/ops/metrics.js` and `src/ops/prom-metrics.js` into one exporter under `prom-metrics.js`. Keep legacy metric **names** as aliases for one release to avoid breaking dashboards.
- RED/USE per service: per-route HTTP latency histograms, error counters, and resource gauges. Already 80% there — finish the 20%.
- Business KPIs as first-class metrics (each tied to a Master Flow stage):
  - `erp_quotes_created_total{outcome}`, `erp_quotes_won_total`, `erp_orders_value_ils` (gauge)
  - `erp_workorders_active{status}`, `erp_purchase_orders_value_ils`
  - `erp_invoices_overdue_count`, `erp_payments_collected_value_ils`
  - `erp_payroll_run_duration_seconds{period}`
- Cardinality cap: enforce ≤ 10k unique series per metric (already done by route-template normalization in `apm.js apmMiddleware`).
- Exemplars (OTLP exemplar support) so a histogram bucket sample carries the trace_id that produced it.

### 3.3 Tracing Target (the biggest gap)
- Add `@opentelemetry/sdk-node` + `@opentelemetry/auto-instrumentations-node` to all 4 services. Auto-instrument: `http`, `express`, `pg`, `redis`, `mongodb`, `bullmq`, `fetch`.
- Custom spans on every state-machine transition (13 machines × 91 transitions per `state-machines.js`) — span name `pipeline.transition.<entity>.<from>->.<to>`.
- Custom spans on every orchestrator action (18 actions in `orchestrator.js`) — span name `orchestrator.<action>`.
- Custom spans wrapping each cross-service contract call (7 contracts per `wiring-spec.js`).
- W3C Trace Context propagation across the 4 services via `traceparent` header.
- Backend: deploy **Tempo** (Grafana Tempo, S3-backed) under `k8s/20-tempo.yaml`. OTel Collector at `k8s/21-otel-collector.yaml` ingests OTLP/gRPC on 4317.
- Sample 100% of error traces, 10% of slow traces (>p95), 1% baseline.

### 3.4 Audit Target
- Single audit writer module (`src/audit/writer.js`) with `audit.record({ entity, action, before, after, actor })` — pulls `correlation_id`, `trace_id`, `tenant_id` from AsyncLocalStorage automatically. **Stop** scattering audit-write logic across feature modules.
- Hash-chain audit rows: each row stores `prev_hash` + `row_hash = SHA256(prev_hash || canonical_json(row))` — gives Israeli regulators tamper-evidence at zero infra cost. Migration `0009X_audit_hash_chain.sql`.
- Mirror critical audit events to a separate append-only table (`governance.audit_logs_immutable`) on a logical replication slot to a read-only standby — survives a compromised primary.
- 7-year retention (Israeli tax law) enforced by the writer; partition `governance.audit_logs` by month.
- Add `trace_id` and `tenant_id` columns to `governance.audit_logs` (both nullable initially → backfill → NOT NULL).

### 3.5 Alerting Target
- Keep Prometheus rules + Alertmanager. Add a second tier of **business alerts** distinct from infra alerts:
  - `BusinessFlowStalled`: any entity stuck in a non-terminal state > SLA per `state-machines.js`.
  - `ApprovalQueueAging`: quotes/POs awaiting approval > 48h.
  - `BankReconBreak`: bank statement vs ledger mismatch > ILS 100.
  - `PayrollDeadlineRisk`: monthly payroll not run by 28th of month.
- Severity-to-channel routing already exists. Add a fourth tier (`page` → PagerDuty) for `critical` rules covering business flows.
- All alerts must have a `runbook_url` AND the runbook must exist (today some 404).
- SLO burn-rate alerts (multi-window: 5m × 1h × 6h × 3d) for the 4 service SLOs. SLOs documented in a new `OPS/SLO.md`.

---

## 4. Gap Analysis

| # | Gap | Severity | Current | Target | Effort |
|---|---|---|---|---|---|
| 4.1 | Three logger modules (pino singleton, zero-dep ops/logger, cli/logger) | M | Drift between bindings, redaction lists | One re-export with feature flag | 1 day |
| 4.2 | Two metrics modules (`metrics.js` vs `prom-metrics.js`) with different metric names | M | Dashboards reference both prefixes | Consolidate, keep aliases | 2 days |
| 4.3 | **No OpenTelemetry SDK / no traces** | **HIGH** | trace_id field passive | Auto-instrumentation + 13 state-machine spans + 18 orchestrator spans + Tempo backend | 2 weeks |
| 4.4 | No exemplar linkage (metric → trace) | M | Independent silos | Histogram exemplars carry trace_id | 3 days (after 4.3) |
| 4.5 | `correlation_id` on `audit_logs` not reliably populated | M | NULL on most rows | Audit writer pulls from ALS; backfill known sources | 4 days |
| 4.6 | No audit hash-chain | M | Audit rows are mutable in-place by `superuser` | row_hash + prev_hash columns + trigger | 2 days |
| 4.7 | Audit writer scattered across modules | M | Inconsistent fields, missed events | Single `audit.record()` call site | 1 week |
| 4.8 | No business-flow alerts | M | Only infra alerts | Add 4-6 business rules tied to state machines | 3 days |
| 4.9 | Runbook URLs may 404 | L | URLs reference a host with unverified existence | Verify + create stubs | 1 day |
| 4.10 | No SLO definitions | M | Implicit | OPS/SLO.md + burn-rate alerts | 4 days |
| 4.11 | Tempo / Jaeger / OTel Collector not in `k8s/` | HIGH | No trace backend | k8s/20-tempo.yaml + k8s/21-otel-collector.yaml | 3 days |
| 4.12 | Log retention / WORM cold tier undefined | M | Loki default | 7d/30d/365d tiering, S3 object lock | 1 week |

**Total estimate to close all 12 gaps:** ~6 weeks, sequenced behind P0 (4.3, 4.5, 4.11) → P1 (4.4, 4.6, 4.7, 4.8, 4.10, 4.12) → P2 (4.1, 4.2, 4.9).

---

## 5. Implementation Sequence

### Phase 1 — Tracing foundation (weeks 1-2)
1. Add OTel SDK + auto-instrumentations to all 4 services (`onyx-procurement`, `techno-kol-ops`, `payroll-autonomous`, `onyx-ai`). Bootstrap from `tracer.js` loaded **before** any other require so http/pg/express get patched.
2. Deploy `k8s/21-otel-collector.yaml` (gateway pattern: receives OTLP, exports to Tempo + Prometheus + Loki).
3. Deploy `k8s/20-tempo.yaml` with S3 backend, 30-day retention.
4. Wire `correlationId()` middleware to also generate `trace_id`/`span_id` if missing (via OTel API), keep header-based propagation.
5. Add custom spans for 18 orchestrator actions, 91 state-machine transitions, 7 cross-service contracts.

### Phase 2 — Audit hardening (week 3)
1. Migration: add `trace_id text`, `tenant_id bigint`, `prev_hash text`, `row_hash text` to `governance.audit_logs`.
2. New `src/audit/writer.js` with single entry point. Replace 30+ scattered audit write sites incrementally — the legacy table accepts both shapes.
3. Trigger `audit_logs_chain_trigger` computes row_hash on insert.
4. Create logical replication slot to `audit_logs_immutable` standby.

### Phase 3 — Metrics consolidation + exemplars (week 4)
1. Merge `metrics.js` into `prom-metrics.js`. Keep legacy names as aliases.
2. Add exemplar parameters to histogram observations (`metrics.httpRequestDurationSeconds.observe(value, labels, { trace_id })`).
3. Add 12 business KPI metrics tied to Master Flow stages.

### Phase 4 — Logging consolidation (week 5)
1. `@onyx/logger` package re-exports pino in normal mode, falls back to zero-dep impl when `OBS_DEPS=stdlib`.
2. Unify redaction allow-lists (today: pino redacts 6 paths, ops/logger redacts 22 patterns + Israeli ת.ז regex).
3. Set up Loki retention tiers + Promtail label normalization across the 4 services.

### Phase 5 — Alerts & SLOs (week 6)
1. Author `OPS/SLO.md` with 4 service SLOs (availability, latency p95, error rate, freshness).
2. Multi-window burn-rate alerts.
3. Business-flow alert rules in a new file `ops/alerts/business-rules.yml`.
4. Verify every `runbook_url` resolves; create stub runbooks where missing.

---

## 6. Service-by-Service Map

| Service | Port | Logger | Metrics endpoint | Trace status (target) | Audit emitter |
|---|---|---|---|---|---|
| TECHNO_KOL_OPS | 3200 | pino → Loki | /metrics (Prom) | OTel auto + 91 SM spans | wiring/event-bus → audit.record() |
| ONYX_PROCUREMENT | 3100 | pino → Loki | /metrics (Prom) | OTel auto + 18 orchestrator spans | pipeline/* → audit.record() |
| PAYROLL_AUTONOMOUS | 5173 (/payroll) | pino → Loki | /payroll/metrics | OTel auto + payroll-specific spans | payroll-engine → audit.record() |
| ONYX_AI | 3300 (/ai) | pino → Loki | /ai/metrics | OTel auto + LLM call spans | ai-bridge → audit.record() |

---

## 7. KPIs / Acceptance

The strategy is correctly implemented when:
- A click on any failing request in Grafana traverses **logs → trace → audit row → DB query** without leaving Grafana.
- `governance.audit_logs.correlation_id` is populated on >99% of new rows over a 7-day window.
- Every histogram bucket has at least one exemplar trace_id resolvable in Tempo.
- `OBS_DEPS=stdlib` boots all 4 services with zero npm deps for air-gapped sites.
- Israeli regulators can verify audit-log integrity by re-computing the hash chain from the migration date forward — matches stored `row_hash`.
- Burn-rate alerts fire **before** an SLO is exhausted (multi-window catches slow burns).

---

## 8. Key File Paths (absolute)

- Logging: `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\onyx-procurement\src\logger.js`
- Logging (zero-dep): `...\onyx-procurement\src\ops\logger.js`
- Metrics (legacy): `...\onyx-procurement\src\ops\metrics.js`
- Metrics (prom-format): `...\onyx-procurement\src\ops\prom-metrics.js`
- APM: `...\onyx-procurement\src\ops\apm.js`
- Alert rules: `...\onyx-procurement\ops\alerts\rules.yml`
- Alert dispatcher: `...\onyx-procurement\ops\alerts\notification-dispatcher.js`
- Audit table DDL: `...\supabase\migrations\00000_master_schema.sql:133`
- K8s observability: `...\k8s\17-prometheus.yaml`, `...\k8s\18-grafana.yaml`, `...\k8s\19-loki.yaml`
- Pipeline definitions referenced: `...\onyx-procurement\src\pipeline\state-machines.js`, `orchestrator.js`, `wiring-spec.js`
