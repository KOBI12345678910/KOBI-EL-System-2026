# Master QA Report — Techno-Kol Uzi ERP 2026

**Date:** 2026-04-29
**Branch:** `claude/objective-merkle-40ff93`
**Scope:** Full system audit + 4-ZIP merge integration
**Overall verdict:** **RED — production deploy blocked.** System is structurally rich but operationally dark on critical paths (orchestration, RLS, AI bridge).

---

## 1. Audit footprint

- **200 QA agents allocated** across 6 waves (01–200)
- **62 reports written** to `_qa-reports-25/AGENT-*.md` (see inventory below)
- ~30 agents rate-limited mid-run (server throttling, not user limit) — re-runnable
- Cross-reference report: `AGENT-195-aggregator.md` (184 deduped findings, 14 CRIT / 53 HIGH / 75 MED / 47 LOW)
- Critical-path: `AGENT-196-critical-path.md` (top-20 ordered by leverage)
- Effort: `AGENT-197-effort.md` (~860 hours / ~108 dev-days estimated)

---

## 2. Top critical findings

### CRIT-1 — Tenant RLS effectively nonexistent (Agent 09)
- **318 policies use `USING (true)`** — fully open
- **59 production tables have RLS DISABLED** including `api_keys`, `env_variables`, `webhooks`, `system_logs`, `tenant_integrations`
- **5 tables with RLS enabled but ZERO policies** (locked-out tables)
- **57 tables lack `tenant_id`** despite multi-tenancy live since 2026-04-22
- **29 `tenant_id` columns lack indexes** → seq-scan when policies tighten
- **167 FK columns without indexes**
- 11 corrective migrations sequenced (00072-00082) — indexes-first

### CRIT-2 — onyx-ai loads wrong file at boot (Agent 03)
- `src/index.ts` does `require('./onyx-platform')` but new endpoints live only in `index.ts`
- All Procurement→AI bridge calls **404 in production**
- Three platform copies exist: `index.ts`, `onyx-platform.ts`, `onyx-integrations.ts`
- **`dotenv` listed as dep but never imported** → all API keys (Anthropic, OpenAI, WhatsApp, Supabase, Vault) undefined silently
- Port chaos: CLAUDE.md says 3300, .env.example says 3200, Dockerfile says 3300, entrypoint listens on PORT and proxies to PORT+1

### CRIT-3 — State machine engine is decorative (Agents 16, 31, 79)
- CLAUDE.md says 13 SMs / 91 transitions; **actual is 15 / 115**
- **32 trigger blocks have no dispatcher** — no `POST /transition` handler
- **12 listeners declared, 0 registered** with the event bus
- **Effects only logged, never executed** — `executeOrchestration` self-admits "simplified"
- 3 invalid preconditions (`project.in_production`, `rfq.decided`, `work_order.done`) — **FIXED in this session**

### CRIT-4 — Israeli payroll math has 6 correctness bugs (Agent 04)
- Sick pay flattened to 50% (statutory: 0/50/100 ladder)
- Income-tax annualisation naive — ignores YTD true-up despite loading YTD
- All allowances treated as taxable (travel/meal exemption + שווי rules absent)
- `vacation_pay = hours × base_salary` — silent catastrophic over-pay if base is monthly
- No negative-net-pay guard, no 25% deduction cap (חוק הגנת השכר ס׳ 25)
- BL rounding half-away-from-zero; btl.gov.il expects floor-to-agora → 1-agora drift per line in Form 102

### CRIT-5 — IL tax filings half-built (Agents 19, 132, 133, 134, 135)
- **PCN874 monthly VAT summary: NOT IMPLEMENTED** (regulatory blocker)
- **BKMVDATA / מבנה אחיד (regulation 36): NOT IMPLEMENTED** — cannot serve tax inspector audit
- **PCN836: byte-width Hebrew padding bug** (`fmtText` vs `fmtTextBytes`)
- **Form 856 (annual freelancer withholding): zero implementation** — only DB enum stubs
- **Form 102: 3 surfaces, conflicting** rounding & employer-rate logic; submission is `PLACEHOLDER`
- **Masav: 2 parallel exporters** (120-byte custom vs 128-byte BoI-spec) — first will be rejected at bank ingestion

### CRIT-6 — Deploy infra has show-stoppers (Agents 20, 141, 167)
- **CI branch filter was `[main]` only — repo uses `master`** → CI not running on default branch (FIXED)
- **No `timeout-minutes`** on any GHA job (6h default risk) — partially FIXED for ci.yml
- **GCP region drift** — `deploy.sh` defaults europe-west3 but cloudbuild YAMLs use me-west1 (Tel Aviv)
- **K8s `02-secret.yaml` has CHANGE_ME placeholders committed** — own banner says don't commit yet committed
- **All 4 Cloud Run services use `--allow-unauthenticated`**
- **Compose `/health` vs Dockerfile `/healthz`** — health probes silently fail
- **Migrations not gated in CI** — image can ship against unmigrated DB
- **No `pino.redact`** — PII (emails, JWTs, bank accounts) leaks to logs
- **Sentry DSN in env but `@sentry/node` not in deps** — half-wired

### CRIT-7 — Workspace install fragile (Agent 05)
- Two workspace packages with same name `@workspace/integrations-anthropic-ai` → pnpm v9+ should error
- `erp-mobile` brings `@shopify/react-native-skia` which fails Windows pnpm install with EPERM
- Workaround: install with `--filter "!@workspace/erp-mobile"`

### CRIT-8 — Whole vertical domains MISSING from migrations (Agents 112, 113, 126, 128)
- **Hotel domain**: 5 tables exist in production DB but **zero CREATE TABLE in repo** — schema drift, can't rebuild
- **Health/clinical**: domain absent (only payroll-side BL health insurance)
- **Automotive Service**: 3 tables missing
- **Events/conference**: domain absent

### CRIT-9 — MFA enforcement is UI-only (Agent 147)
- 2 parallel TOTP impls (one secure, one wired-but-regressed)
- Backup codes stored **plaintext** in `userMfaTable.backupCodes`
- Login pipeline doesn't consult `roleMfaRequirementsTable` → role can require MFA but session still privileged

### CRIT-10 — Toast/notification system silently broken (Agent 172)
- 4 competing toast systems mounted, Sonner installed but not mounted
- ~51 `toast.success/error` calls from 20 files no-op silently
- `TOAST_REMOVE_DELAY = 1_000_000ms` (~16.6 min) — toasts never auto-dismiss

---

## 3. Fixes already applied in this session

| # | File | Change |
|---|------|--------|
| 1 | `payroll-autonomous/vite.config.js` | port 5174 → 5173 (matches CLAUDE.md) |
| 2 | `onyx-procurement/src/pipeline/orchestrator.js:82` | precondition `in_production` → `in_procurement` |
| 3 | `onyx-procurement/src/pipeline/orchestrator.js:122` | precondition `decided` → `approved` |
| 4 | `onyx-procurement/src/pipeline/orchestrator.js:164` | precondition `done` → `completed` |
| 5 | `.github/workflows/ci.yml` | branches: `[main]` → `[main, master]` |
| 6 | `.github/workflows/security.yml` | branches: `[main]` → `[main, master]` |
| 7 | `.github/workflows/deploy-preview.yml` | branches: `[main]` → `[main, master]` |
| 8 | `.github/workflows/security.yml` | `--audit-level=critical` → `=high` (matches step name) |
| 9 | `.github/workflows/ci.yml` | added `timeout-minutes` to 3 jobs (30/30/20) |

---

## 4. Top 10 remaining P0 fixes (next sprint)

1. **Wire 6 pipeline APIs** — unblocks all 9 Master 360 P0 pages (Agent 196 #1)
2. **Tenant-RLS hardening** — 318 USING(true) policies + 59 disabled tables; books-of-record open (Agent 09)
3. **onyx-ai 3-platform consolidation** + add `dotenv/config` (Agent 03)
4. **`tenant_id` indexes on 29 tables** before flipping RLS (Agent 09)
5. **Migration gate in deploy.yml** (Agent 20)
6. **Health path drift** `/health` ↔ `/healthz` (Agent 21)
7. **State-machine transition executor** + register 12 listeners (Agents 16, 79)
8. **Dual payroll implementation consolidation** + IL tax 6 bugs (Agent 04)
9. **Add `dir="rtl"` to `erp-app/index.html`** (Agent 10)
10. **PCN874 + BKMVDATA builders** (Agents 132, 19) — regulatory blocker

---

## 5. Completed agent reports inventory (62 files)

Service runtimes: 03, 04, 05 · Pipeline: 26, 27, 28, 29, 30, 31 · Domains: 32–40, 111–120, 125, 126, 127, 128, 129, 130, 131 · 360 pages: 41–49 · Migrations: 50–53 · Multi-tenant: 124 · IL compliance: 19, 132, 133, 134, 135, 136, 146 · Integrations: 138, 139, 140, 141, 142, 143, 144, 156 · Security: 09, 13, 147, 148 · UX/UI: 10, 11, 17, 137, 171–177, 179 · DevOps: 20, 167, 169, 170 · Architecture/Cross-cut: 15, 16, 21, 60, 79, 154, 195, 196, 197 · Forecasting/ML: 181, 182, 183, 193, 194 · Reporting: 180 · Time tracking: 186 · Misc: 48 (Finance360), 145 (portals), 157 (changelog)

Rate-limited mid-run (re-runnable): 101, 111, 115, 119, 127, 131, 138, 143, 148, 152, 156, 168, 172, 190, 200

---

## 6. Cross-cloud setup status

- **GitHub repo**: `KOBI12345678910/KOBI-EL-System-2026` ✅ connected
- **Supabase projects** (15 total in org):
  - **Master:** `kobi-el-system-2026` (`ponypxhushxeskxgrmha`) — 60/73 migrations applied, 231 public tables
  - Secondary: Techno-Uzi-Erp, Techno-Uzi-Command-2026, ERP-Business-Manager, kobi-hamelech-2026, others
- **Branch**: `claude/objective-merkle-40ff93` (this work)

---

## 7. ZIP merge status

| ZIP | Status | Where |
|---|---|---|
| `_qa-reports.zip` (5MB) | ✅ Merged: 0 new (all 319 already present) | _qa-reports/ |
| `technokoluzi-erp (1).zip` (158MB) | ✅ Extracted filtered to staging | _merge-incoming/technokoluzi-erp/ |
| `Techno-Uzi-Erp.zip` (1.6GB) | 🔄 Extracted filtered to staging | _merge-incoming/techno-uzi-erp/ |
| `AI-Task-Manager (1).zip` (2.6GB) | 🔄 Extracted filtered to staging | _merge-incoming/ai-task-manager/ |

Filters skip: `.git/`, `node_modules/`, `dist/`, `build/`, `.next/`, `.cache/`, `.turbo/`, `coverage/`, `__pycache__/`, `.config/`, `uploads/`, `.canvas/assets/`. Smart-merge by mtime ensures only newer/missing files copy.

---

## 8. Recommended Go/No-Go

**NO-GO for production until at minimum these P0 items close:**
- Tenant RLS hardening (the big one — books-of-record currently open)
- onyx-ai canonical platform + dotenv
- Pipeline API wiring (6 routes)
- IL payroll 6 correctness bugs
- PCN874 + BKMVDATA builders
- Health probe path alignment
- Migration gate in CI

Estimated unblock effort: ~44 hr critical path (per Agent 197).

---

*Generated by 200-agent parallel QA system. Last updated: 2026-04-29.*
