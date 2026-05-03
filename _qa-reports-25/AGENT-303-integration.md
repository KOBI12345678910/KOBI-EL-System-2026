# AGENT-303 — Integration Test Report (E2E Connection Audit)

**Date:** 2026-04-29
**Auditor:** Agent 303 (Integration Test)
**Worktree:** `objective-merkle-40ff93`
**Scope:** Frontend↔Backend, Backend↔DB, Backend↔External APIs, Auth↔Roles, Forms↔Save, Dashboard↔Data, Upload↔Storage, Notifications↔Events
**Method:** Static read of source + cross-reference with prior agent reports (203, 202, 09, 142, 139, 179, 276–280, 264, 265, 288, 290, 171, 232).

---

## 0. Verdict

**RED — system is NOT integrated end-to-end.** Out of 8 connection planes audited, **0** are clean, **3** are partially wired, **5** have CRITICAL data-loss or 404 chains. Three independent frontends and four services run with mismatched routing, three independent event vocabularies, three parallel persistence backends, and zero tenant isolation in writes. The dashboards show numbers, but ~80% of those numbers are hardcoded `FALLBACK_*` arrays, not real DB rows.

| Plane | Status | Highest sev |
|---|---|---|
| 1. FE ↔ BE | **RED** | CRIT — ~50 distinct 404s |
| 2. BE ↔ DB | **AMBER** | HIGH — 100 AMBER, 20 RED tables |
| 3. BE ↔ External APIs (SMS/WA/Stripe/Twilio) | **RED** | CRIT — Twilio + Inforu live mode throws; Stripe webhook 404 |
| 4. Auth ↔ Roles ↔ Tenants | **RED** | CRIT — RBAC exists, 34 of 39 routes don't call it; zero tenant filter on writes |
| 5. Forms ↔ Save | **RED** | CRIT — 4 CRM pages throw `validateAll is not a function`; 2 pages persist to localStorage only |
| 6. Dashboard ↔ Data | **RED** | HIGH — 1,458 `FALLBACK_*` arrays in `erp-app/`, mock-always pattern dominates |
| 7. Upload ↔ Storage | **AMBER** | HIGH — GCS prod path dead outside Replit; Supabase Storage enabled w/o buckets/policies |
| 8. Notifications ↔ Events | **RED** | CRIT — in-memory store, lost on restart; orchestrator events never published |

---

## 1. FE ↔ BE Integration

Three frontends and three backends are routed but mostly miswired (cross-ref AGENT-203):

- `techno-kol-ops/client` (3200) → `techno-kol-ops/src/` (Express).
- `AI-Task-Manager/artifacts/erp-app` and `erp-app` (Vite) → `api-server` (8080) via `/api` proxy.
- None of the frontends point at `onyx-procurement` (3100), so the 11 `control-room/*`, `orchestrator/execute`, and `workflows/*` routes that live there are unreachable from any UI.

### 1.1 BUG-303-01 — Broken router mount style in api-server (~25 endpoints)
- **Description:** `routes/index.ts` registers sub-routers with a path prefix while the handlers themselves write `router.get("/api/...")` or `router.get("/agents/...")`. The result is doubled or dropped segments.
- **Steps:** Mount `agent-orchestration.ts` at `/agents`; handler defines `router.get("/agents", ...)` → exposed at `/api/agents/agents`. FE calls `/api/agents`.
- **Actual:** 404.
- **Expected:** 200.
- **Severity:** CRIT.
- **Module:** `api-server/src/routes/index.ts` (lines 517, 601, 805, 832, 842, 844).
- **Fix:** Strip leading prefix from handlers OR drop mount prefix; keep one style. Affected: `agents`, `incidents`, `competitors`, `contracts/*`, `contractor-payment/*`, `po-approval*`, `israeli-integrations/*`, `procurement-rfq/*`.

### 1.2 BUG-303-02 — Phantom `/api/integrations/*` family
- **Description:** 8+ pages call `POST /api/integrations/{send-email,invoke-llm,upload}` (Base44 SDK pattern, never ported).
- **Actual:** 404 on every call. Email-sender, image-uploader, agent-chat, online-payment-button, auto-report-scheduler, workflow-executor — all silently fail.
- **Severity:** CRIT.
- **Module:** `api-server/src/routes/`.
- **Fix:** Add `/api/integrations/*` shim or rewrite callers to `/api/email/send`, `/api/llm/invoke`, `/api/storage/upload`.

### 1.3 BUG-303-03 — Notification verb mismatch
- **Description:** FE uses `PUT /api/notifications/:id/read` and `POST /api/notifications/mark-all-read`; BE exposes `PATCH`.
- **Severity:** HIGH.
- **Module:** `api-server/src/routes/notifications.ts:181,199`; `erp-app/src/components/notification-bell.tsx:73,100`.
- **Fix:** Change FE to PATCH, or add PUT/POST aliases.

### 1.4 BUG-303-04 — `/api/projects/*` family missing in techno-kol-ops
- **Description:** `Project360.tsx` makes 16+ calls to `/api/projects/*` (work-orders, pos, materials, inventory, invoices, payments, employees, tasks, expenses, logistics, documents, audit-log, alerts, phases, reports). None mounted.
- **Severity:** CRIT.
- **Module:** `techno-kol-ops/src/index.ts`.
- **Fix:** Implement projects router OR proxy to onyx-procurement via `procurement-bridge.ts`.

### 1.5 BUG-303-05 — Quote360 endpoints absent
- **Description:** `pages/sales/Quote360.tsx` calls `/api/quotes/:id/360`, `/send`, `/reject`, `/convert-to-project`. Nothing matches in api-server (closest is `/quote-builder/*`).
- **Severity:** CRIT — entire 360 page is dead.
- **Module:** `api-server/src/routes/`.

### 1.6 Counts
- techno-kol-ops/client: 38 unique paths, **27 broken** (71%).
- AI-Task-Manager/erp-app + erp-app: 60 unique paths, **~38 broken** (~63%).

---

## 2. BE ↔ DB Integration

(cross-ref AGENT-202, AGENT-09, AGENT-277)

| Metric | Count |
|---|---:|
| Tables defined | 204 |
| Tables w/ read route | 139 |
| Tables w/ write route | 159 |
| Tables w/ real RLS | 186 (91%) |
| RED (no API + no RLS) | 20 |
| AMBER (partial coverage) | 100 |

### 2.1 BUG-303-06 — 7 parallel-table families on customer-data surface
- **Description:** `public.crm_*` and `commercial.*`, `public.ar_*` and `finance.*`, `public.proc_*` and `procurement.*`, `public.inv_*` and `inventory.*`, `public.hr_*` and `workforce.*`, `public.pm_*` and `execution.*`. Both populated; FE writes one, reports read the other → **eventually-inconsistent ledger**.
- **Severity:** CRIT (financial integrity).
- **Module:** `supabase/migrations/`.
- **Fix:** AGENT-277 plan — sync triggers Phase 1, cutover Phase 2, drop Phase 3.

### 2.2 BUG-303-07 — 318 always-true RLS policies (`USING (true)`)
- **Description:** 244 tables protected by no-op policies. Multi-tenant SaaS dashboard ("3000 businesses") boots into a single shared RLS namespace.
- **Severity:** CRIT.
- **Module:** Migrations 00001, 00029, 00043–00067.
- **Fix:** Re-implement using `governance.current_tenant_id()` helper in every USING clause.

### 2.3 BUG-303-08 — 167 FK columns without index
- **Description:** Every join through these FKs is a seq-scan. Dashboards that aggregate `gl_journal_lines` × `gl_accounts` × `gl_periods` will TIMEOUT at scale.
- **Severity:** HIGH.
- **Module:** AGENT-220 patch already drafted.

### 2.4 BUG-303-09 — `inventory` and `invoices` (singular) orphaned
- **Description:** Pre-redesign tables with no FK in/out. Some routes still INSERT into them (per AGENT-09 §Orphaned).
- **Severity:** MEDIUM.
- **Fix:** Drop in M82.

---

## 3. BE ↔ External APIs

### 3.1 BUG-303-10 — Twilio SMS adapter throws "live-mode wiring deferred"
- **Description:** `onyx-procurement/src/sms/send-sms.js:301-325`. `SMS_LIVE_MODE=1` + creds → throws. HTTP request to `api.twilio.com/2010-04-01/Accounts/{sid}/Messages.json` is documented inline only.
- **Actual:** Stub returns deterministic `queued`; nothing leaves the box.
- **Expected:** Real POST.
- **Severity:** CRIT (CRITICAL notifications never reach phone).
- **Fix:** Implement HTTP call with form-encoded body + Basic auth; honor `RetryAfter`.

### 3.2 BUG-303-11 — Inforu (default IL SMS) — same defer
- **Description:** `SMS_PROVIDER=inforu` is the default; `SMS_LIVE_MODE=1` throws `'inforu: live-mode wiring deferred'`.
- **Severity:** CRIT — primary IL SMS channel is offline.
- **Fix:** Wire `capi.inforu.co.il/api/v2/SMS/SendSms`.

### 3.3 BUG-303-12 — Stripe / SendGrid / Twilio / Supabase webhook routes allowlisted but unmounted
- **Description:** `api-server` allowlists `/api/stripe/webhook`, `/api/sendgrid/webhook`, `/api/twilio/webhook`, `/api/supabase/webhook` but no router defines them.
- **Actual:** 404 on every inbound webhook.
- **Severity:** CRIT — payments never reconcile, bounce notifications drop, SMS DLR lost.
- **Module:** `api-server/src/app.ts`.

### 3.4 BUG-303-13 — Outgoing webhook test-fire has no HMAC + no SSRF guard
- **Description:** `api-server/src/routes/platform/webhooks-management.ts:74` posts to subscriber URL with static `Authorization` only. Anyone can target `http://169.254.169.254/...` (instance metadata) or any internal IP.
- **Severity:** CRIT.
- **Fix:** Sign with subscription secret; deny private/loopback hosts unless `WEBHOOKS_SAFE_MODE=false` was explicitly disabled by an admin.

### 3.5 BUG-303-14 — Procurement → AI bridge silently 404s on all 4 routes
- **Description:** `onyx-procurement/src/ai-bridge.js` calls `/evaluate`, `/events`, `/budget`, `/health` on `:3200`. The routes only exist in `onyx-ai/src/index.ts` (dead twin). The live `onyx-platform.ts` doesn't define them. Bridge has `SOFT_MISS_STATUS = {404, 501}` returning `null` without warn.
- **Actual:** Every policy check, audit event, budget probe is dropped silently.
- **Severity:** CRIT (compliance + cost-control).
- **Module:** `onyx-ai/src/onyx-platform.ts` (~30 LOC fix).

### 3.6 BUG-303-15 — WhatsApp status store is in-memory
- **Description:** `_statusStore = new Map()` in `whatsapp.js`. Restart wipes delivery acknowledgments → no replay.
- **Severity:** HIGH.

---

## 4. Auth ↔ Roles ↔ Tenants

(cross-ref AGENT-290, AUTH_AUDIT.md)

### 4.1 BUG-303-16 — RBAC engine declared but unused
- **Description:** `onyx-procurement/src/auth/rbac.js` defines 11 roles + ~80 resources. Only **5 of 39** top-level routes in `server.js` call `requirePermission()`. `techno-kol-ops` uses one boolean (`requireAdmin`).
- **Severity:** CRIT — read/write IDOR on most endpoints.
- **Fix:** Wrap routers in `requirePermission(resource, action)`.

### 4.2 BUG-303-17 — Zero tenant filter in any INSERT/UPDATE
- **Description:** `grep tenant_id|company_id|org_id` across `techno-kol-ops/src/routes` and `onyx-procurement/server.js` → **zero matches** in writes. JWT contains `{id, username, role}` only.
- **Actual:** "3000 businesses / 3B users" dashboard writes everything into one tenant.
- **Severity:** CRIT.

### 4.3 BUG-303-18 — `POST /api/auth/refresh-session` returns 404
- **Description:** `lib/utils.ts:38` calls it; no handler.
- **Severity:** HIGH — sessions can't be refreshed.

### 4.4 BUG-303-19 — Object-level / IDOR protection only on `payroll/wage-slips`
- **Description:** Other entities (employees, customers, projects, POs) accept any authenticated user with any id.

### 4.5 MFA backup codes
- See AGENT-222 — backup-code path needed; partial wiring noted.

---

## 5. Forms ↔ Save

### 5.1 BUG-303-20 — `validateAll` does not exist; 4 CRM pages throw on Save
- **Description:** `useFormValidation` (hooks/use-form-validation.tsx) returns `{validate, validateField, ...}` — no `validateAll`. 4 pages call `validation.validateAll(form)`:
  - `pages/crm/territory-management.tsx:119`
  - `pages/crm/contract-management.tsx:140`
  - `pages/crm/commission-management.tsx:167`
  - `pages/crm/leads-ultimate.tsx:158`
- **Actual:** `TypeError: validation.validateAll is not a function`; save handler aborts.
- **Severity:** CRIT.
- **Fix:** `validateAll = validate` alias in hook.

### 5.2 BUG-303-21 — shadcn `Form` component is dead code
- **Description:** Correct RHF + zod + ARIA boilerplate in `components/ui/form.tsx` — zero imports across pages. Pages use hand-rolled hook with no resolver, no aria-invalid, no aria-describedby.
- **Severity:** HIGH (a11y + correctness).

### 5.3 BUG-303-22 — Accounting settings persisted to localStorage only
- **Description:** `accounting-portal.tsx:1862-1874` saves company name, VAT rate, accountant contact via `localStorage.setItem`. No API call.
- **Actual:** Switching browser/device wipes Israeli VAT 18% + accountant id.
- **Severity:** CRIT — BKMV-874 / Form 856 cannot generate without server-side data.
- **Fix:** Wire `PUT /api/settings/accounting` (does not exist yet).

### 5.4 BUG-303-23 — `admin/users`, `admin/audit-log`, `admin/notifications` are in-memory arrays
- **Description:** `techno-kol-ops/src/routes/admin.ts` uses `const users: UserRecord[]`, `const auditLog: AuditEntry[]`, `notifications.ts` uses `const notificationsStore: Notification[]`. Restarts wipe everything.
- **Severity:** CRIT — security audit fabrication risk + role changes lost.

---

## 6. Dashboard ↔ Data

(cross-ref AGENT-265, AGENT-122)

### 6.1 BUG-303-24 — 1,458 `FALLBACK_*` constants across 361 pages in `erp-app`
- **Description:** Dominant pattern (~80%): page calls `useQuery`, reads ONE slice from response, the rest are hardcoded `FALLBACK_*`.
  - `service-dashboard.tsx`: KPIs from API; `agents`, `slaCategories`, `ticketDistribution`, `tickets` all FALLBACK.
  - `tools-dies.tsx`: queries `/api/assets/tools_dies`; `consumptionData`, `maintenanceSchedule`, `orderNeeded` always hardcoded.
  - Top 10 hotspots all 10–12 mock arrays each.
- **Severity:** HIGH — dashboards show plausible numbers that aren't real.
- **Fix:** Either ship the BE endpoint (project-360, hr-analytics, integration-dashboard, import-analytics) or remove the fallback so the page errors loudly.

### 6.2 BUG-303-25 — Read-model views referenced but not migrated
- **Description:** `analytics.rm_customer_360`, `rm_ai_summary`, `rm_executive_summary`, `rm_finance_summary`, `rm_operations_summary`, `rm_procurement_summary`, `rm_workforce_summary` exist as table names with RLS but **no read route** and **no migration body**.
- **Severity:** HIGH.

---

## 7. Upload ↔ Storage

(cross-ref AGENT-142)

### 7.1 BUG-303-26 — GCS prod path dies outside Replit
- **Description:** `api-server/src/lib/objectStorage.ts` mints credentials via Replit sidecar `127.0.0.1:1106/token`. Prod deploy uses `GCS_BUCKET=bash44-uploads` + `GOOGLE_APPLICATION_CREDENTIALS` — **not consumed** by `objectStorage.ts`.
- **Actual:** Sign call returns "make sure you're running on Replit" outside Replit.
- **Severity:** CRIT.
- **Fix:** Branch on `GOOGLE_APPLICATION_CREDENTIALS` and use service-account JWT signing; keep Replit path as fallback.

### 7.2 BUG-303-27 — Supabase Storage enabled, zero buckets/policies
- **Description:** `supabase/config.toml [storage] enabled = true`; no migration creates buckets, no `storage.objects` RLS, no MIME or size limits. Client uses anon key in browser.
- **Severity:** CRIT — first `supabase.storage.from('x').upload()` will hit unconfigured server or auto-create public bucket.

### 7.3 BUG-303-28 — Two parallel upload paths — multer + GCS
- **Description:** `documents.ts` and `dms.ts` use multer to local disk; rest of app uses GCS. No single source of truth; documents not replicated to GCS, can't be served from CDN.
- **Severity:** HIGH.

### 7.4 BUG-303-29 — ACL race window after upload
- **Description:** `objectAcl.ts` writes ACL via 5-attempt retry loop AFTER upload completes. Until ACL lands, `canAccessObject` returns `false` even for owner. Inverted-fail-closed but noisy.
- **Severity:** MEDIUM.

### 7.5 BUG-303-30 — Portal user authz uses substring match on `file_url`
- **Description:** `routes/storage.ts` matches `supplier_documents.file_url LIKE %objectPath%`. Spoofable if any other table column ever stores attacker text.
- **Severity:** HIGH.

---

## 8. Notifications ↔ Events

(cross-ref AGENT-179, AGENT-276, AGENT-280)

### 8.1 BUG-303-31 — Three event vocabularies, none reconcile
- **Description:** `procurement.po.approved` (EventBus #1), `workorder:completed` (OPS), `invoice.paid` (Webhook), `quote.approved` (orchestrator), `quote_approved` (pipeline trigger). Five spellings for the same business idea. **None of the 16 registered EventBus types are actually emitted anywhere in the repo.**
- **Severity:** CRIT — orchestrator says "events emitted" but no consumer ever sees them.
- **Fix:** Pick one canonical name + spelling, register publishers, retire others.

### 8.2 BUG-303-32 — Orchestrator `events: [...]` is a string literal — never published
- **Description:** `onyx-procurement/src/pipeline/orchestrator.js` returns `result.events_emitted` as plain text. No `eventBus.emit` call. (Also flagged by AGENT-128 §3.)
- **Severity:** CRIT.

### 8.3 BUG-303-33 — Notification store is in-memory in techno-kol-ops
- **Description:** `routes/notifications.ts` `const notificationsStore: Notification[] = []`, capped at 500. Inter-service POST from onyx-procurement → ops drops on restart.
- **Severity:** CRIT.

### 8.4 BUG-303-34 — SSE notifications stream has no backpressure
- **Description:** `/api/notifications/stream`, `/api/live-ops/stream`, `/api/chat/stream` all `res.write` directly with no per-client queue limit. Slow clients pin the event loop. Only `onyx-procurement/src/realtime/sse-hub.js` has `MAX_CLIENT_QUEUE = 500`.
- **Severity:** HIGH.

### 8.5 BUG-303-35 — Payroll LiveDashboard requests channels server doesn't publish
- **Description:** Client subscribes to `['payroll','procurement','alerts']`; server default channel list is `['invoices','payments','inventory','alerts','system_health']`. Only `alerts` matches. `payroll` and `procurement` fall through to default set silently.
- **Severity:** HIGH — users see empty live feed and assume "all quiet".

### 8.6 BUG-303-36 — `EVENT_TRIGGERS` audit log only fires on manual `POST /api/pipeline/trigger`
- **Description:** 11 entries (`quote_approved`, `lead_converted`, `po_received`, …) declared in `pipeline-engine.js:218-281`. No producer auto-fires them — manual cURL only.
- **Severity:** HIGH — audit gap.

---

## 9. Cross-cutting integration counts

| Issue class | Count |
|---|---:|
| FE 404 endpoints | ~50 |
| FE method mismatches | 2 |
| Phantom legacy `/api/integrations/*` | 4+ |
| Tables w/o RLS | 59 |
| Always-true RLS policies | 318 |
| FK without index | 167 |
| Parallel-table families | 7 |
| `FALLBACK_*` arrays in erp-app | 1,458 |
| In-memory persistence pages | 4 critical |
| External webhook routes 404 | 4 |
| External SMS adapters in stub mode | 7 (all of inforu/cellact/twilio/sms4free/messagenet/truedialog/019) |
| Outbound webhook senders w/o HMAC | 1 |
| Routes calling RBAC | 5 / 39 |
| Tenant filter in writes | 0 |

---

## 10. Top-10 fixes (priority order)

1. **Wire RBAC + tenant_id on every write.** Without this the platform cannot ship to >1 customer. AGENT-213/214 patches needed.
2. **Fix the ~25 broken router mounts in `api-server/src/routes/index.ts`.** Single PR, biggest 404 reduction.
3. **Implement Twilio + Inforu live HTTP** in `send-sms.js`. CRITICAL channel.
4. **Mount Stripe / SendGrid / Twilio / Supabase webhook receivers** with HMAC verify (`webhook-verify.ts` already exists, just attach).
5. **Replace 4 in-memory stores** (`admin/users`, `admin/audit-log`, `notifications`, `accounting-portal localStorage`) with DB writes.
6. **Add `validateAll` alias** in `useFormValidation` so CRM saves stop throwing.
7. **Implement `/api/projects/*` family** in techno-kol-ops or proxy to onyx.
8. **Wire onyx-ai `/evaluate /events /budget /health`** in the live runtime (`onyx-platform.ts`); flip `SOFT_MISS_STATUS` 404 → warn instead of silent.
9. **Remove `FALLBACK_*` arrays from top-20 dashboard pages**, ship matching read-model endpoints.
10. **Decide GCS strategy for prod** — branch `objectStorage.ts` on `GOOGLE_APPLICATION_CREDENTIALS`; create Supabase Storage buckets + RLS or remove `[storage] enabled` from config.

---

## 11. Verified-OK (working integration points)

So the report isn't all red:

- `POST /api/auth/login` (techno-kol-ops + api-server).
- `GET/PATCH/DELETE /api/notifications/*` core (api-server) — only the verb mismatches above are broken.
- `POST /api/portal/auth/{register,login}`.
- Inventory: `/api/raw-material-stock`, `/api/finished-goods-stock`, `/api/warehouse-locations`.
- `/api/remnants*`, `/api/cut-nesting/*`.
- `/api/currency-exposures`, `/api/commodity-risks`, `/api/risk-summary`.
- WhatsApp inbound webhook signature (HMAC-SHA256 + `crypto.timingSafeEqual`).
- Onyx outbound webhook engine (HMAC, exp backoff, DLQ after 6 attempts).
- Onyx SSE hub backpressure + ring-buffer + Last-Event-Id replay.
- Customer360 page (the **only** AMBER-not-RED 360 page).
- Payroll wage-slip object-level authorization (only ownership gate found).

---

**End of AGENT-303 report.**
