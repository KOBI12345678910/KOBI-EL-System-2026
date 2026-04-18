# ARCHITECTURE — Techno-Kol Uzi Mega ERP

Author: Agent-35
Date: 2026-04-11
Scope: 5-project polyrepo — metal fabrication + real estate ERP for Techno-Kol Uzi
Status: Wave 1.5 live (VAT / Annual-Tax / Bank-Recon / Payroll all bolted onto onyx-procurement)

---

## 1. High-Level ASCII Architecture

```
                            ┌─────────────────────────────────────┐
                            │        EXTERNAL SERVICES            │
                            │                                     │
                            │  WhatsApp Business API   (graph.fb) │
                            │  Twilio SMS (fallback)              │
                            │  Israel Tax Authority  שמ"ת         │
                            │  Bituach Leumi                      │
                            │  Bank statement feeds (MT940/CSV)   │
                            └────▲──────────────────▲─────────────┘
                                 │HMAC-SHA256       │
                                 │signed webhooks   │HTTPS out
                                 │                  │
 ┌────────────────┐              │                  │
 │ payroll-       │   fetch      │                  │
 │ autonomous     │   X-API-Key  │                  │
 │  (React/Vite)  │──────────────┘                  │
 │  port 5173     │────────────────────┐            │
 │  Palantir dark │                    │            │
 │  RTL dashboard │                    │            │
 └────────────────┘                    │            │
                                       ▼            │
                           ┌───────────────────────────────┐
                           │                               │
                           │     onyx-procurement          │
                           │     (Express / Node 20)       │◄───── webhook /webhook/whatsapp
                           │     port 3100                 │
                           │     entry: server.js          │
                           │                               │
                           │  ╔═══════════════════════════╗│
                           │  ║ Core routes              ║│
                           │  ║  /api/suppliers          ║│
                           │  ║  /api/purchase-requests  ║│
                           │  ║  /api/rfq                ║│
                           │  ║  /api/quotes             ║│
                           │  ║  /api/purchase-orders    ║│
                           │  ║  /api/subcontractors     ║│
                           │  ║  /api/analytics          ║│
                           │  ║  /api/audit              ║│
                           │  ╠═══════════════════════════╣│
                           │  ║ Wave 1.5 bolted modules  ║│
                           │  ║  src/vat/*      (PCN836) ║│
                           │  ║  src/tax/*      (1301/1320/6111/30א)
                           │  ║  src/bank/*     (parsers, matcher)
                           │  ║  src/payroll/*  (wage-slip + PDF)
                           │  ╚═══════════════════════════╝│
                           └──┬──────────────┬─────────┬───┘
                              │              │         │
                              │REST          │REST     │ (optional bridge)
                              ▼              ▼         ▼
                      ┌──────────────┐  ┌─────────────────┐
                      │   onyx-ai    │  │ techno-kol-ops  │
                      │  (TS/Node)   │  │  (TS/Node +     │
                      │  port 3200   │  │   React client) │
                      │  entry:      │  │  port 5000      │
                      │  dist/       │  │  entry:         │
                      │  index.js    │  │  src/index.ts   │
                      │              │  │                 │
                      │ Event-sourced│  │ WebSocket +     │
                      │ agent core:  │  │ realtime alert  │
                      │  Governor    │  │ engine + Apollo │
                      │  Orchestrator│  │ Brain + AIP +   │
                      │  KG / DAG    │  │ Ontology layer  │
                      │  procurement-│  │ (Palantir-style)│
                      │  bridge ▲    │  │                 │
                      └──────┬───────┘  └────────┬────────┘
                             │                   │
                             └──────────┬────────┘
                                        │ pg driver / supabase-js
                                        ▼
                             ┌──────────────────────────┐
                             │   Supabase-hosted        │
                             │   PostgreSQL (primary DB)│
                             │                          │
                             │  Schemas:                │
                             │   • suppliers, rfqs, PO  │
                             │   • vat_periods, tax_inv │
                             │   • projects, customers  │
                             │   • bank_accounts, tx    │
                             │   • employees, wage_slips│
                             │   • audit_log, events    │
                             │   • schema_migrations    │
                             └──────────────────────────┘
```

**Dependency direction** (arrows = "depends on / calls"):
- `payroll-autonomous` ──► `onyx-procurement` (REST, X-API-Key)
- `onyx-procurement`   ──► Supabase Postgres (supabase-js)
- `onyx-procurement`   ──► WhatsApp Graph API, Twilio
- `onyx-ai`            ──► `onyx-procurement` (via `procurement-bridge.ts`, REST)
- `techno-kol-ops`     ──► Supabase Postgres (pg driver)
- `techno-kol-ops`     ◄── `techno-kol-ops/client` (React SPA, same repo)
- Supabase Postgres    ◄── all four backend projects converge here

---

## 2. Per-Project Breakdown

### 2.1 onyx-procurement (the core ERP)

| Field                 | Value |
|-----------------------|-------|
| Role                  | Authoritative procurement + finance backend; owns all money-bearing tables; serves the Wave 1.5 Israeli-tax/payroll/bank modules |
| Tech stack            | Node ≥20, Express 4.21, `@supabase/supabase-js`, helmet, cors, express-rate-limit, pdfkit, bwip-js, csv-parse, pino |
| Port                  | `3100` (env `PORT`) |
| Entry                 | `onyx-procurement/server.js` (1,206 lines, single-file orchestrator) |
| Key modules           | `src/vat/vat-routes.js`, `src/vat/pcn836.js`, `src/tax/annual-tax-routes.js`, `src/tax/form-builders.js`, `src/bank/bank-routes.js`, `src/bank/parsers.js`, `src/bank/matcher.js`, `src/payroll/payroll-routes.js`, `src/payroll/wage-slip-calculator.js`, `src/payroll/pdf-generator.js`, `src/ai-bridge.js`, `src/logger.js` |
| External deps         | Supabase REST (DB), WhatsApp Business Cloud API (`graph.facebook.com/v21.0`), Twilio SMS (optional), filesystem (`data/pcn836`, wage-slip PDFs) |
| Auth                  | X-API-Key header, `AUTH_MODE=api_key` (disabled in dev), public paths `/api/status`, `/api/health`, webhook verify |
| Security              | helmet (CSP disabled for RTL), CORS allowlist from `ALLOWED_ORIGINS`, HMAC-SHA256 on `/webhook/whatsapp`, raw-body capture for signature, timing-safe compare, `RATE_LIMIT_API_MAX` default 300/15min, separate webhook limiter |
| Observability         | pino logger, audit-log table, global error handler (stack trace hidden in prod) |

### 2.2 payroll-autonomous (React dashboard for wage slips)

| Field                 | Value |
|-----------------------|-------|
| Role                  | Thin React UI over `onyx-procurement /api/payroll/*`; all tax/salary logic lives server-side to stay auditable under חוק הגנת השכר תיקון 24 |
| Tech stack            | React 18.3, Vite 5.4, ESM |
| Port                  | `5173` (Vite default) |
| Entry                 | `payroll-autonomous/src/main.jsx` → `src/App.jsx` (479 lines) |
| Key modules           | Single-file `App.jsx` — Palantir-style dark theme, Hebrew RTL, fetches via `VITE_API_URL` + `VITE_API_KEY` |
| External deps         | `onyx-procurement` REST only |

### 2.3 techno-kol-ops (real-time operations hub + SPA)

| Field                 | Value |
|-----------------------|-------|
| Role                  | Factory real-time operations platform — jobs, work orders, attendance, GPS, alerts, WebSocket feed, Palantir-Foundry-style ontology & AIP layer |
| Tech stack            | Node + TypeScript 5.3, Express 4.18, `pg`, `ws` (WebSocket), bcryptjs, jsonwebtoken, node-cron, date-fns. Client: React + Vite (`client/`) |
| Port                  | `5000` (env `PORT`) |
| Entry                 | `techno-kol-ops/src/index.ts` (134 lines — pure router glue), client `techno-kol-ops/client/src/main.tsx` |
| Key modules           | `src/routes/*.ts` (20 routers — workOrders, employees, materials, clients, suppliers, alerts, attendance, financials, gps, tasks, messages, leads, reports, pipeline, intelligence, supplyChain, brain, ontology, aip, signatures), `src/realtime/websocket.ts`, `src/realtime/alertEngine.ts`, `src/realtime/autonomousEngine.ts`, `src/realtime/eventBus.ts`, `src/services/ontology.ts`, `src/services/aiCoordinator.ts`, `src/services/whatsappBot.ts`, `src/services/signatureService.ts`, `src/ai/brainEngine.ts`, `src/apollo/apolloEngine.ts`, `src/db/connection.ts`, `src/db/schema.sql`, `src/db/migration_v2.sql` |
| External deps         | Postgres via `pg` driver, JWT (signed HS256), bcrypt password hashing, WebSocket server share-port with Express |
| Auth                  | JWT login (`/api/auth/login`) — username/password, bcrypt compare, 24h token |

### 2.4 onyx-ai (autonomous agent control plane)

| Field                 | Value |
|-----------------------|-------|
| Role                  | Institutional-grade autonomous agent platform: event-sourced governor, compliance + risk layer, DAG orchestrator, knowledge graph, procurement-bridge back into onyx-procurement |
| Tech stack            | Node ≥20, TypeScript 5.7, Express 4.21, helmet, cors, dotenv; CommonJS build |
| Port                  | `3200` (env `PORT`) |
| Entry                 | `onyx-ai/src/index.ts` (2,761 lines — monolithic core), dist: `dist/index.js` |
| Key modules           | `src/modules/procurement-engine.ts`, `src/modules/procurement-hyperintelligence.ts`, `src/modules/subcontractor-decision-engine.ts`, `src/modules/financial-autonomy-engine.ts`, `src/modules/hr-autonomy-engine.ts`, `src/modules/intelligent-alert-system.ts`, `src/modules/situation-engine.ts`, `src/modules/data-flow-engine.ts`, `src/modules/dms.ts`, `src/procurement-bridge.ts`, `src/security.ts`, `src/onyx-platform.ts`, `src/onyx-integrations.ts` |
| External deps         | `onyx-procurement` REST, AI/LLM (HTTP clients are hand-rolled in `index.ts`), filesystem for event log |
| Design notes          | Explicit "No simulations. No Math.random() pretending to be intelligence. Every decision has a real reasoning chain." Uses event-sourced state, monotonic clock, `Result<T,E>` type. |

### 2.5 Supabase Postgres (shared data plane)

Not a project but the single source of truth. All four backend projects read/write here.
Deployment: Supabase cloud, Postgres 15+, TLS only, rotating anon key + service-role key in env.

---

## 3. End-to-End Data-Flow Walkthroughs

### 3.1 "Kobi creates RFQ" (end-to-end)

1. **UI** (internal dashboard or Replit panel) calls `POST /api/purchase-requests` on `onyx-procurement:3100` with `X-API-Key`.
2. Helmet → CORS → rate limiter → `requireAuth` middleware: sets `req.actor = api_key:xxxxxx…`.
3. Handler inserts into `purchase_requests` + `purchase_request_items`, `audit()` logs to `audit_log`.
4. Second call `POST /api/rfq/send` with the PR id and a list of supplier ids.
5. Server inserts `rfqs` row (status=`sent`), fans out `rfq_recipients`, then iterates suppliers and calls `sendWhatsApp(to, body)` per recipient → `graph.facebook.com/v21.0/{WA_PHONE_ID}/messages` using bearer token.
6. Each send result is written back to `rfq_recipients` (`delivered`, `sent_at`). `system_events` row logs outgoing send.
7. When a supplier replies, WhatsApp hits `POST /webhook/whatsapp` → `verifyWhatsAppHmac` validates `x-hub-signature-256` using `crypto.createHmac('sha256', WA_APP_SECRET)` and `timingSafeEqual`. On success the message is logged in `system_events` and (in production flow) matched back to the RFQ by supplier phone.
8. Clerk records structured `supplier_quotes` + `quote_line_items` via `POST /api/quotes`.
9. `POST /api/rfq/:id/decide` runs the weighted-score comparator → inserts `procurement_decisions` with `reasoning JSONB`, optionally drafts a `purchase_orders` row in `draft`.
10. `POST /api/purchase-orders/:id/approve` → status `approved`, audit row captured.
11. `POST /api/purchase-orders/:id/send` → WhatsApp message to the winning supplier; `sent_at` stamped.
12. Every mutation also fires an entry in `audit_log (entity_type, entity_id, action, actor, detail, previous_value, new_value)`.
13. `onyx-ai`'s `procurement-bridge.ts` can subscribe/pull these rows to feed the autonomous decision engine.

### 3.2 "Monthly payroll run"

1. Operator opens `payroll-autonomous` (Vite dev 5173) → dashboard authenticates with `VITE_API_KEY` stored in localStorage.
2. UI `GET /api/payroll/employers`, `GET /api/payroll/employees?employer_id=…` → lists active employees from `employees`.
3. For each employee the UI posts `POST /api/payroll/wage-slips` with `{ employee_id, period_year, period_month, hours_regular, hours_overtime_*, bonuses, … }`.
4. Handler calls `wage-slip-calculator.js`:
   - Applies Israel 2026 income-tax brackets (10/14/20/31/35/47/50%), subtracts נקודות זיכוי (`TAX_CREDIT_POINT_MONTHLY = 248`).
   - Applies Bituach Leumi low/high rates around monthly threshold ₪7,522 up to max base ₪49,030.
   - Applies מס בריאות, pension, study fund (employee + employer), severance employer.
   - Returns an object matching the full `wage_slips` column set.
5. Server inserts into `wage_slips` (CHECK `net_pay = gross_pay − total_deductions`), snapshot employer/employee identity fields as frozen text so the slip is legally reproducible.
6. `pdf-generator.js` (pdfkit) emits the PDF — Hebrew RTL, every Amendment-24 field — and writes to disk, setting `pdf_path` + `pdf_generated_at`.
7. `POST /api/payroll/wage-slips/:id/approve` → status `approved`, `payroll_audit_log` row with `before_state`/`after_state`.
8. Nightly `employee_balances` snapshot updates vacation/sick/study-fund balances (generated columns).
9. Optional: wage-slip PDF sent to employee via WhatsApp (`sendWhatsApp`) — delivery logged to `notifications`.

### 3.3 "Import bank statement and auto-reconcile"

1. Operator uploads `leumi_2026_03.csv` or `.mt940` through the dashboard → `POST /api/bank/statements/import`.
2. `src/bank/parsers.js`: sniffs format → `parseCsv` / `parseMt940Statement` → normalised transaction rows with `{date, amount, description, reference, counterparty}`.
3. Server inserts one `bank_statements` row and N `bank_transactions` rows (amount positive = credit, negative = debit); `raw_data JSONB` retained for audit.
4. `src/bank/matcher.js` auto-matches against ledger:
   - Exact-amount + date-window matches against `customer_payments`, `customer_invoices`, supplier payments, `wage_slips` (payroll disbursement), tax payments.
   - Each candidate scored 0..1 → `reconciliation_matches` row, `match_type` ∈ {exact, auto, suggested, manual}.
   - On high confidence (≥0.95) the `bank_transactions.reconciled` flag flips, `matched_to_type/_id` set.
5. Mismatches drop into `reconciliation_discrepancies` (`unmatched_bank_tx`, `amount_mismatch`, `duplicate_entry`, …) with severity.
6. `v_unreconciled_summary` view surfaces outstanding balance per account to the dashboard.
7. Human-in-the-loop approves `suggested` matches in UI → `approved=true`, `approved_by=actor`.

### 3.4 "Close VAT period and submit PCN836"

1. Monthly cron or user click: `POST /api/vat/periods` with `{period_start, period_end, period_label:"2026-03"}`.
2. Server inserts `vat_periods` row (status `open`). `v_current_vat_period` view computes totals from `tax_invoices` where `vat_period_id = :id`.
3. During the period, every incoming invoice lands in `tax_invoices` (direction input/output, with `vat_rate=0.17`, `allocation_number` for 2024 Invoice Reform, linked back via `source_type`/`source_id` to `purchase_orders` or `customer_invoices`).
4. `POST /api/vat/periods/:id/close` → period status → `closing`, computed totals (`taxable_sales`, `vat_on_sales`, `taxable_purchases`, `vat_on_purchases`, `net_vat_payable`) locked onto the row, `locked_at` stamped.
5. `POST /api/vat/periods/:id/submit` → `src/vat/pcn836.js::buildPcn836File({companyProfile, period, inputInvoices, outputInvoices, submission})`:
   - Generates fixed-width PCN836 lines per Israel Tax Authority spec.
   - Returns `{lines[], metadata:{filename, checksum}, pcn836_payload}`.
   - `validatePcn836File(file)` checks line widths & required records.
6. File written to `data/pcn836/PCN836_{vat_file_number}_{YYYYMM}.TXT`.
7. `vat_submissions` row inserted with `submission_type='initial'`, `submission_method='shamat'|'paper'|'api'`, full `pcn836_header`/`pcn836_records` JSONB, `pcn836_file_path`, `pcn836_file_checksum`.
8. `vat_periods.status` → `submitted`, `submission_reference` populated from authority response, `submitted_at` set.
9. Audit trail in `audit_log` + `schema_migrations` tracked per migration (version '004' = VAT module).
10. The generated `.TXT` file is downloadable via `GET /api/vat/periods/:id/pcn836` (Content-Disposition attachment).

---

## 4. Cross-Cutting Concerns

### 4.1 Authentication
- **onyx-procurement**: `X-API-Key` header compared against `process.env.API_KEYS` comma list. `AUTH_MODE ∈ {api_key, disabled}`. `req.actor = api_key:xxxxxx…` for audit.
- **techno-kol-ops**: JWT — `POST /api/auth/login` → bcrypt compare against `users.password_hash` → HS256 token (`JWT_SECRET`, 24h).
- **onyx-ai**: custom `src/security.ts`, talks back to onyx-procurement with the same API-key flow.
- **payroll-autonomous**: browser holds key in `localStorage.ONYX_API_KEY` or `VITE_API_KEY`. No user accounts on this UI — it rides on the upstream key.

### 4.2 Authorization
The string `actor` is the universal identity on every audit row. It is one of:
- `api_key:aa1234…` (first 6 chars of caller's API key)
- `user:<username>` (techno-kol-ops JWT subject)
- `system:cron`, `system:webhook`, `system:autonomous`
- `public` (only for `/api/status` and `/api/health`)

There is no RBAC role system in onyx-procurement — every authenticated key is effectively super-user. Authorization is enforced at the network edge (who holds the key) and audited after the fact via `audit_log`. techno-kol-ops carries a `role` in the JWT payload but there is no server-side policy engine yet.

### 4.3 Logging
- onyx-procurement: `pino` + `pino-pretty` in dev; structured JSON in prod. `logger.js` wraps it.
- techno-kol-ops: `console.*` with ANSI prefixes (`[FOUNDRY]`, `[BRAIN]`).
- onyx-ai: an internal append-only event log (event-sourced), plus `console.*`.
- **Unified audit table**: `audit_log` in Supabase with `entity_type / entity_id / action / actor / previous_value / new_value` — every mutation in onyx-procurement writes here. `payroll_audit_log` is a dedicated augmented table for payroll events (ip_address, user_agent, before/after JSONB).

### 4.4 Error handling
- Express global error handler at the tail of `server.js`: logs stack, returns `{error}` in prod (no stack leak) or `{error, stack[]}` in dev.
- `process.on('unhandledRejection')` logs without exiting.
- Module load is wrapped in `try/catch` (VAT/Tax/Bank/Payroll each load independently — one failing module does not take the server down).
- Graceful shutdown on SIGTERM/SIGINT with 10s forced-exit timer.

### 4.5 Migrations
- Tracked in `schema_migrations (version, name, applied_at, applied_by, checksum, execution_ms, rolled_back, notes)`.
- Files are SQL only, under `onyx-procurement/supabase/migrations/` (`000…007`) and `techno-kol-ops/supabase/migrations/` (`001-operations-core.sql`) + `techno-kol-ops/src/db/schema.sql` + `migration_v2.sql`.
- Each file wrapped in `BEGIN;`/`COMMIT;` and ends with `INSERT INTO schema_migrations … ON CONFLICT DO UPDATE` so re-runs are safe (idempotent DDL: `CREATE TABLE IF NOT EXISTS`, `ALTER … IF EXISTS`).
- Migration 003 backfills earlier migrations (001/002) and normalises money columns to `NUMERIC(14,2)`.

### 4.6 Backups
- Primary: Supabase automated daily backups + point-in-time recovery window (7–14 days depending on tier).
- Secondary: `DR_RUNBOOK.md` documents disaster-recovery sequence. PCN836 `.TXT` files are archived to disk under `data/pcn836/` with checksums in `vat_submissions.pcn836_file_checksum`.
- Wage-slip PDFs archived under a `data/` tree with path recorded on the row — so the filesystem is a soft secondary store.

---

## 5. Design Principles

1. **Never delete, only upgrade** — there are zero `DELETE` statements on business entities. Status flags (`voided`, `amended`, `archived`, `cancelled`, `closed`, `disputed`), `amendment_of INTEGER` self-refs, `locked_at` timestamps. Every row has `created_at`, most have `updated_at`, many have `created_by`. Amendments reference the original via FK, so the original stays legible forever.
2. **Hebrew-first RTL** — every UI string, every comment in migrations, every audit-log detail is Hebrew by default. Helmet CSP is deliberately disabled on onyx-procurement because the RTL dashboards inject inline styles.
3. **Palantir dark theme** — standard palette: bg `#0b0d10`, panel `#13171c/#1a2028`, border `#2a3340`, text `#e6edf3`, accent `#4a9eff`, success `#3fb950`, warning `#d29922`, danger `#f85149`. Font stack leads with Heebo. Enforced in `payroll-autonomous/src/App.jsx` and mirrored in techno-kol-ops client.
4. **Audit everything** — every mutating route in onyx-procurement calls `audit(entity_type, entity_id, action, actor, detail, prev, next)`. Payroll has a dedicated `payroll_audit_log` capturing IP/user-agent.
5. **Money precision: `NUMERIC(14,2)`** — migration 003 backfills this across all money columns. Max ₪999,999,999,999.99 ≈ ₪1T. Float is banned in business math.
6. **Fail fast, boot strict** — onyx-procurement exits with a clear error if `SUPABASE_URL` / `SUPABASE_ANON_KEY` are missing. Webhook HMAC is mandatory in production; missing in prod returns 500 before processing the body.
7. **Event-sourced where it matters** — onyx-ai is a pure event-sourced engine (append-only log + replay + snapshot), and techno-kol-ops has an `eventBus` + WebSocket fan-out for real-time workstation updates.
8. **Split of authority** — the 5 projects intentionally do not share code; they share the database. This keeps each project deployable (and blast-radius-limited) on its own.

---

## 6. Known Limitations / Future Work

| # | Limitation | Impact | Suggested fix |
|---|---|---|---|
| L1 | No RBAC / permissions model in onyx-procurement — every valid API key is super-user | High on multi-tenant readiness, low today (single tenant) | Introduce `roles` + `policies` table + middleware before first external partner |
| L2 | JWT secret rotation in techno-kol-ops is manual (`JWT_SECRET` env), no token revocation list | Medium | Add `user_sessions` table with `revoked_at`, or short TTL + refresh token |
| L3 | `cors({origin:'*'})` in `techno-kol-ops/src/index.ts` line 43 — wide-open CORS | Medium | Match the `ALLOWED_ORIGINS` pattern from onyx-procurement |
| L4 | onyx-procurement `server.js` is a 1,206-line monolith; Wave 1.5 modules are correctly extracted but core routes are still inline | Medium dev-velocity cost | Extract `/suppliers`, `/rfqs`, `/purchase-orders` into `src/core/*-routes.js` with the same `registerXRoutes(app, deps)` pattern |
| L5 | `onyx-ai/src/index.ts` is 2,761 lines in one file — hard to code-review | Medium | Split `SECTION 0..N` headers into individual modules per section |
| L6 | No typed SDK between projects — `payroll-autonomous` and `onyx-ai` hand-roll `fetch` against onyx-procurement | Low | Generate a tiny OpenAPI → TS client once routes settle |
| L7 | Bank reconciliation uses heuristic matcher with confidence threshold — no ML model yet | Low | Ship current heuristic, log decisions, retrain from `reconciliation_matches.match_criteria` later |
| L8 | No integration tests exercising `webhook/whatsapp → audit_log` path | Medium | Add test harness under `tests/` that posts a signed webhook and asserts on `system_events` row |
| L9 | Filesystem archive (`data/pcn836/*`, wage-slip PDFs) is on the same host as the server — single point of failure | High for legal retention | Mirror to S3 / Supabase Storage + checksum verification on read |
| L10 | Rate limit pools are per-IP in memory, not distributed | Low while on single node | Swap to Redis-backed limiter on horizontal scale-out |
| L11 | `DELETE CASCADE` exists on FK chains (`supplier_products`, `rfq_recipients`, `quote_line_items`, `po_line_items`, `reconciliation_matches`) — violates "never delete" in principle | Low (never exercised today) | Change to `ON DELETE RESTRICT` or soft-delete columns |
| L12 | The 5 projects do not share a common migration chain — drift risk | Medium | Introduce an umbrella `supabase/migrations` runner or at least a cross-project `schema_migrations` dashboard |
