# QA-19 — Blockers Only (Sorted by Fix Priority)

**Agent:** QA-19 Release Readiness Agent
**Date:** 2026-04-11
**Scope:** Every Critical / Blocker finding across all 5 ERP projects
**Rule:** a finding lives here only if it must be fixed before any internet-exposed deployment.

This file is a dense, actionable cut of the full report in `QA-19-release-readiness.md`. Same classifications, same sources, sorted by **shortest path to green**.

---

## Summary

| Severity tier | Count | Hours to fix |
|---|---|---|
| Phase 0A — under 1 hour each, touches live code | 12 | ~5h |
| Phase 0B — 1–8 hours each, security wiring + audit + VAT + state | 8 | ~19h |
| **Phase 0C (NEW)** — secrets rotation, SQL-i, IDOR, UX confirmations — from sibling QA-12/QA-13/QA-11 | 18 | ~18h |
| Phase 3 — multi-week compliance and business-process modules | 12+ | ~12+ weeks |
| **Total Critical blockers** | **45+** | **~12+ weeks** |

Blockers are sorted below by time-to-green inside each phase. An engineer working top-down can knock out Phase 0A in one working day and unlock CONDITIONAL GO for a VPN-only environment.

---

## PHASE 0A — Fastest wins (do these first)

### 1. QA-19-BLOCKER-A — Security bundle not wired into techno-kol-ops
**ETA:** 30 min
**Project:** techno-kol-ops
**Source:** QA-19 fresh audit (2026-04-11)
**Fix:** Follow `techno-kol-ops/INSTRUCTIONS_TO_WIRE.md` §2 verbatim. Add the `require('./middleware/security.js')` block after `dotenv.config()`, call `validateEnv()`, then `app.use(helmetMw / jsonBodyMw / corsMw / apiRateLimit / loginRateLimit / requireAuth)`. The bundle is already on disk and already documented; the work is literally the `app.use` lines.
**Verification:** `grep -E 'helmetMw|apiRateLimit|requireAuth|validateEnv' techno-kol-ops/src/index.ts` must return at least 4 matches. CORS is no longer `origin:'*'`.

### 2. B-24 — `APP_URL` missing from techno-kol-ops `.env.example`
**ETA:** 5 min
**Project:** techno-kol-ops
**Source:** QA-01 terminal runtime
**Fix:** Add `APP_URL=http://localhost:5000` to `techno-kol-ops/.env.example`. Optionally fail-fast if missing in `validateEnv()`.
**Verification:** `grep APP_URL techno-kol-ops/.env.example` → 1 hit.

### 3. B-23 — onyx-procurement Supabase crash at module load
**ETA:** 30 min
**Project:** onyx-procurement
**Source:** QA-01
**Fix:** Wrap `createClient(process.env.SUPABASE_URL, …)` in a boot-time validator. If `SUPABASE_URL` or `SUPABASE_ANON_KEY` is empty, `console.error` and `process.exit(1)` before the `require` would throw.
**Verification:** Starting with an empty `.env` prints a clean message and exits 1; does not throw `TypeError: supabaseUrl is required`.

### 4. B-02 / F-07 — Dashboard API base URL hardcoded
**ETA:** 30 min
**Project:** onyx-procurement (web/onyx-dashboard.jsx)
**Source:** Wave 1 direct inspection
**Fix:** `const API = import.meta.env.VITE_API_URL ?? window.location.origin;`
**Verification:** Dashboard loads from any host without editing source.

### 5. B-05 — VAT rate hardcoded to 18% instead of 17%
**ETA:** 30 min
**Project:** onyx-procurement (server.js:377)
**Source:** QA-38 Money Precision
**Fix:** `const VAT_RATE = Number(process.env.VAT_RATE) || 0.17;` plus a historical `vat_rates(effective_from, rate)` table for retroactive correctness.
**Verification:** `₪1000 × 0.17 === 170`.

### 6. B-12 — PO `status='sent'` written even when WhatsApp fails
**ETA:** 30 min
**Project:** onyx-procurement (server.js:661-671)
**Source:** Wave 1 F-02
**Fix:** `if (sendResult.success) { await supabase.from('purchase_orders').update({status:'sent'})... }` else keep `approved` + log failure.
**Verification:** Temporarily break `WA_TOKEN` → PO stays `approved`.

### 7. B-06 — PO `subtotal` double-counts VAT
**ETA:** 1h
**Project:** onyx-procurement (server.js:528)
**Source:** QA-38
**Fix:** `subtotal: lineItems.reduce((s, i) => s + i.total_price, 0)` — compute from line items, not from `winner.total_price` (which already includes delivery_fee).
**Verification:** `subtotal + delivery_fee + vat_amount === total` for every PO in the test fixture.

### 8. B-17 — No rate limiting
**ETA:** 1h
**Project:** onyx-procurement
**Source:** QA-41
**Fix:** `npm install express-rate-limit` + wire per-endpoint limiter (300 req / 15 min, 10 login / 15 min). The pattern is identical to the techno-kol-ops `security.js` — just port it.
**Verification:** 11th login in 15 min → HTTP 429.

### 9. QA-19-BLOCKER-B — techno-kol-ops has no `dist/index.js`
**ETA:** 1h
**Project:** techno-kol-ops
**Source:** QA-06 smoke + QA-19 re-read
**Fix:** Either change `start` to `tsx src/index.ts` (dev-grade), or add `"prestart": "npm run build"` + ensure `tsconfig.json` emits `dist/`. Prefer `tsx` for simplicity in the current phase.
**Verification:** `npm start` from clean checkout boots the server and prints `TECHNO-KOL OPS v2.0 — Foundry Edition running on port ...`.

### 10. B-20 — onyx-ai has no `dist/`, no `prestart`
**ETA:** 1h
**Project:** onyx-ai
**Source:** QA-01
**Fix:** Add `"prestart": "npm run build"` to `package.json`. Ensure `tsc` emits `dist/index.js`.
**Verification:** `rm -rf dist && npm start` boots successfully.

### 11. B-21 — techno-kol-ops/client missing `tsconfig.node.json`
**ETA:** 30 min
**Project:** techno-kol-ops/client
**Source:** QA-01
**Fix:** Create `client/tsconfig.node.json` with standard Vite boilerplate (`"module": "ESNext"`, `"composite": true`, `"include": ["vite.config.ts"]`) **or** remove the `references` line from the main `tsconfig.json`. Prefer the former — it follows the Vite template.
**Verification:** `cd client && npm run build` no longer errors with `TS6053`.

### 12. B-22 — Port 3100 collision (onyx-procurement vs onyx-ai)
**ETA:** 5 min
**Project:** onyx-ai
**Source:** QA-01
**Fix:** Change onyx-ai default `start(port: number = 3200)` in `src/index.ts`. Update `.env.example`.
**Verification:** Both projects can run on the same host with default ports.

**Phase 0A total: ~5 hours, 12 blockers resolved.**

---

## PHASE 0B — Security + audit + state (1–8 hours each)

### 13. B-03 — Zero authentication on `/api/*`
**ETA:** 8h
**Project:** onyx-procurement
**Source:** QA-30 Pentest Plan PTP-A01-01; cross-confirmed by QA-42, QA-43, QA-54
**Fix:** Supabase Auth with server-side JWT verification **and** RLS policies on every table. Default-deny; whitelist per role (owner, ops, supplier). Until RLS is on, the `SUPABASE_ANON_KEY` in server.js must move to a `SERVICE_ROLE` key behind middleware.
**Verification:** `curl https://.../api/suppliers` without Bearer → 401 (not 200 with 13 supplier rows).

### 14. B-04 — WhatsApp webhook has no HMAC
**ETA:** 2h
**Project:** onyx-procurement (server.js:876-901)
**Source:** QA-30 PTP-A08-01
**Fix:** `const sig = req.get('X-Hub-Signature-256'); const expected = 'sha256=' + crypto.createHmac('sha256', META_APP_SECRET).update(req.rawBody).digest('hex'); if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return res.sendStatus(403);` — requires raw body capture (already in techno-kol-ops security.js).
**Verification:** Forged webhook → 403.

### 15. B-15 — IDOR on `POST /api/rfq/:id/decide`
**ETA:** 2h
**Project:** onyx-procurement (server.js:425-593)
**Source:** QA-30 PTP-A01-03
**Fix:** (a) `if (rfq.status === 'decided') return 409;` (b) `const actor = req.user?.id; // never from body` (c) clamp all weights into `[0, 1]`.
**Verification:** Two sequential POSTs → second returns 409; body `{decided_by: 'hacker'}` is ignored.

### 16. B-16 — `SUPABASE_ANON_KEY` used server-side without RLS
**ETA:** merged with B-03 (same change)
**Project:** onyx-procurement
**Source:** QA-43 C-01
**Fix:** Move server to `SUPABASE_SERVICE_ROLE_KEY` behind middleware + enable RLS per B-03. The anon key stays only for the browser dashboard and RLS governs it there.
**Verification:** With RLS on + service role behind auth, a leaked browser URL cannot read tables without a valid JWT.

### 17. B-13 — 4 subcontractor endpoints mutate without audit
**ETA:** 4h
**Project:** onyx-procurement (server.js:691-798, 166)
**Source:** QA-50
**Fix:** Wrap each of `POST /api/subcontractors`, `PUT /api/subcontractors/:id/pricing`, `POST /api/subcontractors/decide`, `POST /api/suppliers/:id/products` in the existing audit middleware. `PUT .../pricing` is the single highest-leverage fix — retroactive price-list edits without a trail are a million-shekel fraud vector.
**Verification:** Every mutation produces an `audit_log` row with `before`, `after`, and `actor` (from JWT, not body).

### 18. B-14 — No migration versioning
**ETA:** 3h
**Project:** onyx-procurement (+ techno-kol-ops)
**Source:** QA-17
**Fix:** Create `schema_migrations(id, name, checksum, applied_at)`; wrap every existing `001-*.sql` in `BEGIN; INSERT INTO schema_migrations ... ON CONFLICT DO NOTHING; COMMIT;`. Add a migration runner that skips already-applied files.
**Verification:** Running `001` twice → no crash on `CREATE INDEX` / `CREATE TRIGGER`.

### 19. B-18 — 9 `purchase_orders.status` values unreachable
**ETA:** 4h
**Project:** onyx-procurement
**Source:** QA-09
**Fix:** Build the state machine. At minimum: `shipped`, `completed`, `rejected`, `cancelled` reachable by API. Document `on_hold`, `disputed`, `returned`, `paid`, `inspected` as future-phase transitions guarded by feature flag. Remove any CHECK constraint values that are not scheduled.
**Verification:** State diagram in docs matches implemented transitions.

### 20. B-19 — onyx-ai never instantiates `OnyxPlatform`
**ETA:** 15 min
**Project:** onyx-ai (src/index.ts ~line 2681)
**Source:** QA-01
**Fix:**
```ts
if (require.main === module) {
  new OnyxPlatform({ persistPath: './data/events.jsonl' })
    .start({ apiPort: Number(process.env.PORT) || 3200 });
}
```
**Verification:** `node dist/index.js` binds a port instead of exiting 0.

**Phase 0B total: ~19 hours, 8 blockers resolved.**

---

## PHASE 0C — Sibling-agent Criticals (read these AFTER Phase 0A+B)

These are the Critical findings from QA-01, QA-10, QA-11, QA-12, QA-13, QA-17, QA-18 and QA-20 that landed in `_qa-reports/` while QA-19 was drafting. They do **not** supersede Phase 0A/B — they **add** to it. Conditional GO for dev/VPN requires Phase 0A + 0B + 0C all green.

### 21. QA13-SEC-001 — Hardcoded super-admin passwords in source
**ETA:** 2h
**Project:** AI-Task-Manager/artifacts/api-server/src/lib/admin-seed.ts
**Source:** QA-13 security §BUG-SEC-001
**Fix:**
1. `git rm --cached admin-seed.ts` (if present in tree) or delete the literal strings.
2. Require `process.env.ADMIN_SEED_PASSWORD` + `ADMIN_SEED_USERNAME` on boot — refuse to start if missing.
3. Rotate **both** `admin/admin123` and `kobiellkayam/KOBIE@307994798` **today** — assume compromised.
4. Per-user `crypto.randomBytes(16)` salt.
5. Force password reset on next login.
**Verification:** `grep -r 'admin123\|KOBIE@307994798' .` → 0 hits.

### 22. QA13-SEC-002 — Committed secrets in `.replit` and `.env`
**ETA:** 3h (+ coordinate JWT invalidation)
**Project:** AI-Task-Manager
**Source:** QA-13 + QA-13-secrets-scan C1..C4
**Fix:**
1. `git rm --cached .replit` and `artifacts/kobi-agent/.env`.
2. Move the 3 hex values (`JWT_SECRET`, `CREDENTIAL_ENCRYPTION_KEY`, `APP_SECRET_KEY`) into Replit Secrets panel.
3. Rotate all three secrets. `openssl rand -hex 32` for each.
4. Bump JWT `iss` or force re-login to invalidate all in-flight tokens.
5. Scrub git history with `git filter-repo` or BFG.
**Verification:** Historic scrubbed, secrets rotated, no literal hex in any tracked file.

### 23. QA13-SEC-004 — SQL-i via column-name interpolation (5 routes)
**ETA:** 3h
**Project:** techno-kol-ops (employees.ts, leads.ts, tasks.ts, clients.ts, workOrders.ts)
**Source:** QA-13 BUG-SEC-004
**Fix:** Introduce `ALLOWED_FIELDS` Set per table; filter `Object.keys(fields)` through it before `setClause`. Return 400 if no valid fields remain.
**Verification:** `POST .../employees/1 { "salary = 99999, is_admin": true }` → 400, not an UPDATE.

### 24. QA13-SEC-005 — SQL-i via table-name interpolation in ontology engine
**ETA:** 1h
**Project:** techno-kol-ops/src/ontology/ontologyEngine.ts
**Source:** QA-13 BUG-SEC-005
**Fix:** `if (!/^[a-z_]+$/.test(schema.table)) throw new Error(...)` for every interpolated identifier, plus a comment marking the invariant. Prefer `pg.Client.escapeIdentifier()` when available.
**Verification:** Code review — every `${schema.table}` / `${link.foreignKey}` has a preceding regex guard.

### 25. QA13-SEC-009 — JWT_SECRET known historical placeholder
**ETA:** 15 min
**Project:** techno-kol-ops/.env.example
**Source:** QA-13 BUG-SEC-009
**Fix:** Change to `JWT_SECRET=CHANGE_ME_GENERATE_WITH_openssl_rand_hex_32`. The blocklist in `security.js` already catches the old value — verify `validateEnv()` runs on boot (solved by QA-19-BLOCKER-A).
**Verification:** `grep techno_kol_secret_2026_palantir .env.example` → 0 hits.

### 26. QA12-RBAC-002 — IDOR: `GET /api/payroll/wage-slips/:id`
**ETA:** 2h
**Project:** onyx-procurement/src/payroll/payroll-routes.js (~line 246)
**Source:** QA-12 RBAC
**Fix:** Extend `req.actor` to an object with `employee_id` + `role`. After the DB fetch, `if (row.employee_id !== req.actor.employee_id && !['admin','manager','accountant'].includes(req.actor.role)) return 403`.
**Verification:** Employee U1 token → 200 only for own slip, 403 otherwise. Test suite `QA-12/C1` passes without `markGap`.

### 27. QA12-RBAC-003 — IDOR: `GET /api/payroll/employees/:id/balances`
**ETA:** 1h (same shape as RBAC-002)
**Project:** onyx-procurement/src/payroll/payroll-routes.js (~line 345)
**Source:** QA-12
**Fix:** Same ownership guard as RBAC-002.
**Verification:** `QA-12/C2` passes.

### 28. QA12-RBAC-004 — Mass-assignment via `insert/update(req.body)`
**ETA:** 4h
**Project:** onyx-procurement server.js, vat-routes.js, annual-tax-routes.js, bank-routes.js
**Source:** QA-12 BUG-QA12-004
**Fix:** `function pick(body, allowed) { return Object.fromEntries(Object.entries(body).filter(([k]) => allowed.has(k))); }`. Replace every `insert(req.body)` / `update(req.body)` with `insert(pick(req.body, ALLOWED[table]))`.
**Verification:** POST with extra fields (`is_admin`, `created_by`, `tenant_id`) — those fields do not persist.

### 29. QA12-RBAC-007 — Employee self-approval of wage slip
**ETA:** 1h
**Project:** onyx-procurement/src/payroll/payroll-routes.js (~line 252)
**Source:** QA-12
**Fix:** `if (!['manager','accountant','admin'].includes(req.actor.role)) return 403;` plus `if (slip.employee_id === req.actor.employee_id) return 403; // four-eyes`.
**Verification:** Employee token → POST approve own slip → 403.

### 30. QA13-SEC-006 — No global auth middleware; `jwt.verify` not algorithm-pinned
**ETA:** Rolled into QA-19-BLOCKER-A (Phase 0A item 1) + B-03 (Phase 0B item 13). Duplicated here for visibility.
**Extra fix required:** in `techno-kol-ops/src/middleware/auth.ts`, change `jwt.verify(token, JWT_SECRET)` to `jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] })` to block `alg:none`.
**Verification:** Forged token with `alg:none` → 401.

### 31. QA11-UX-A04 — PDF wage slip issuance without confirmation
**ETA:** 30 min
**Project:** payroll-autonomous
**Source:** QA-11 UX BUG-UX-A04
**Fix:** Wrap the "הנפק PDF" button in a confirmation modal with a preview of `employee_name / month / gross / net`. Require an explicit "אני מאשר" checkbox before the `apiDownload` call.
**Verification:** Click "הנפק PDF" → modal blocks the action until confirmed.

### 32. QA11-UX-C01 — PCN836 submission without confirmation/preview
**ETA:** 1h
**Project:** client (HRAutonomy or VAT module, files 46-61)
**Source:** QA-11 UX BUG-UX-C01
**Fix:** Two-step submission: (a) preview totals, (b) explicit confirm. Also add a "download only" option that does not file.
**Verification:** Click "הגש PCN836" → preview screen, then confirm.

### 33. QA11-UX-B08 / B09 — Dead `+ עובד חדש` and `+ לקוח חדש` buttons
**ETA:** 1h each = 2h
**Project:** client (HRAutonomy, ClientsModule)
**Source:** QA-11 UX
**Fix:** Wire `onClick` to the existing create-form modal; if the modal doesn't exist, add a stub that navigates to the create route.
**Verification:** Click → form opens.

### 34. QA11-UX-B15 — HRAutonomy 8-tab megapage
**ETA:** 6h (refactor)
**Project:** client/HRAutonomy
**Source:** QA-11 UX
**Fix:** Split the 8 tabs into sub-routes (`/hr/employees`, `/hr/slips`, `/hr/attendance`, `/hr/forms`, ...). Lazy-load each. Measure cognitive load drop via 5-click user test.
**Verification:** No single view has more than 3 primary actions.

### 35. QA17-COMPAT-002 — Windows dev blocker: `cross-env` missing
**ETA:** 15 min
**Project:** techno-kol-ops
**Source:** QA-17
**Fix:** `npm install --save-dev cross-env` + replace `NODE_ENV=development tsx ...` with `cross-env NODE_ENV=development tsx ...` in `package.json` scripts.
**Verification:** `npm run dev` on Windows cmd.exe starts cleanly.

### 36. QA17-COMPAT-005 — Safari 14 / iPad OS 14 blocker
**ETA:** 1h
**Project:** client
**Source:** QA-17
**Fix:** Either bump the `browserslist` to exclude Safari <15.4 **and** document it, or polyfill `Array.prototype.at` and `structuredClone` via `core-js`.
**Verification:** Build output no longer errors in Safari 14 test.

### 37. QA17-A11Y-Z — Pinch-zoom disabled (Israeli a11y law violation)
**ETA:** 15 min
**Project:** client/index.html
**Source:** QA-17
**Fix:** Remove `user-scalable=no` and `maximum-scale=1` from the viewport meta. Use `<meta name="viewport" content="width=device-width, initial-scale=1">`.
**Verification:** Pinch-zoom works on iPad; Lighthouse a11y score improves.

### 38. QA20-MON — Alert transports are `console.log` stubs
**ETA:** 4h
**Project:** onyx-procurement
**Source:** QA-20 monitoring
**Fix:** Replace the stubs with at minimum:
- Email: nodemailer via SMTP env vars.
- WhatsApp: existing Meta client (already wired for supplier messaging).
- SMS: Twilio or Inforu (Israel-friendly).
Alert routing must fan out to at least two channels for P1 incidents.
**Verification:** Trigger `PayrollGenerationFailures` in staging → email + WhatsApp both fire within 60s.

**Phase 0C total: ~18 hours, 18 sibling blockers resolved. Combined with Phase 0A+0B: ~42 hours for CONDITIONAL GO to dev/VPN.**

---

## PHASE 3 — Israeli compliance and missing business-process modules (weeks)

QA-18 UAT added an entire parallel wall of BLOCKERs that confirm and extend Phase 3 scope. These are listed after the original 7 rows.

The following 7 blockers cannot be closed in hours. They require domain work, templates, and in some cases approval from רשות המסים or pension funds. They are documented here so the release manager knows **they are still open** and cannot be waived for a public deployment that touches real employees, real suppliers, or real tax filings.

### 21. B-07 — No income tax module
**ETA:** 1–2 weeks
**Project:** payroll-autonomous
**Source:** QA-87
**Required:**
- נקודות זיכוי table (תושב, תושב אזור, עולה, אם חד-הורית, ילדים…)
- 2026 marginal brackets (up to 50%)
- Resident vs foreign logic
- Integration with `onyx-procurement`'s employee dataset
- Test fixtures against רשות המסים published calculator

### 22. B-08 — Wage slip 18/100 compliant (חוק הגנת השכר תיקון 24)
**ETA:** 5–6 weeks, phased
**Project:** payroll-autonomous + onyx-procurement/src/payroll
**Source:** QA-96 (CRITICAL)
**Required, phased:**
- **Phase A (1 week):** Employer identity (שם, ח.פ./ע.מ., כתובת), employee identity, schema normalization, vacation/sick/study-fund/severance balance fields.
- **Phase B (2 weeks):** PDF pipeline — Agent-48 recommends `@react-pdf/renderer` or `pdfmake`. Must bundle NotoSansHebrew and produce RTL text correctly. Digital signature stamp.
- **Phase C (2 weeks):** 7-year immutable storage (WORM pattern), distribution mechanism (email with read receipt, SMS fallback, in-app inbox), delivery proof capture (currently 100% manual).
**Legal exposure if skipped: ~₪5.4M / year.**

### 23. B-09 — No VAT reporting module (PCN836 + Invoice Reform 2024)
**ETA:** 4 weeks
**Project:** onyx-procurement
**Source:** QA-140
**Required:**
- `vat_rates(effective_from, rate)` table with historical entries.
- `vat_periods(year, month, status, total_output, total_input, delta, submitted_at, response_code)` table.
- `tax_invoices(id, allocation_number, customer, amount_excl_vat, vat_amount, amount_incl_vat, locked_at)` table.
- Invoice allocation number API client to רשות המסים with retry + circuit breaker.
- PCN836 fixed-width generator + structural validator.
- PCN874 aggregate file.
- Upload adapter to שע"מ with receipt capture.
**Legal exposure: criminal per §117 חוק מע"מ for systematic non-compliance.**

### 24. B-10 — No annual return module (1301 / 1320 / 6111)
**ETA:** 4 weeks
**Project:** onyx-procurement
**Source:** QA-141
**Required:**
- Revenue-side tables: `projects`, `invoices`, `customer_payments`, `credit_notes`.
- Trial balance export mapped to 6111 rows.
- 1320 draft generator with P&L + B/S assembly.
- Depreciation schedule.
- Export bundle for external רו"ח sign-off.

### 25. B-11 — No bank reconciliation
**ETA:** 5 weeks
**Project:** onyx-procurement
**Source:** QA-142
**Required:**
- `bank_accounts` + `bank_statements` + `bank_transactions` tables.
- CSV / MT940 / ISO20022 parsers (Bank Hapoalim, Leumi, Mizrahi, Discount formats).
- Auto-matching engine (amount + date + reference).
- Exception dashboard for unreconciled items.
- Tie to `purchase_orders` and `customer_payments` — you cannot verify that `status='sent'` corresponds to real cash movement without this.

### 26. QA-19-BLOCKER-C — nexus_engine & paradigm_engine inert
**ETA:** 2–3 weeks each, or delete from "ERP components" list
**Project:** nexus_engine, paradigm_engine
**Source:** QA-06 smoke
**Required:**
- Route wiring (Express / Fastify) or explicit classification as "offline batch worker" with a documented CLI entry point.
- DB connection (Supabase / pg) if they are supposed to persist.
- `.env.example`.
- Integration path to `techno-kol-ops` or removal from the ERP bundle.
**Recommendation:** decide whether these two engines are ERP components at all. If they are orchestration layers for AI / ontology only and do not need a DB, re-classify them in docs and skip the DB/route gates.

### 27. QA-19-BLOCKER-D (process / meta) — QA findings not in `_qa-reports/`
**ETA:** 1h
**Project:** repo hygiene
**Source:** QA-19
**Required:**
- Copy or symlink `onyx-procurement/QA-AGENT-*.md` into `_qa-reports/` (or vice-versa), and keep a manifest of which agent wrote what. A release manager should not have to grep the whole repo to find the QA corpus.
- Add a `_qa-reports/README.md` listing all 145 agents with links.

### 28. QA18-UAT-P2P-GRN — No goods-receipt note (GRN) table
**ETA:** 1 week
**Project:** onyx-procurement
**Source:** QA-18 UAT Process 1
**Required:** `goods_receipts` table with FK to `purchase_orders.id` + `received_qty`, `received_at`, `received_by`, `condition`. Tie `material_movements` (which currently only links to legacy `work_orders.id`) to the new table.

### 29. QA18-UAT-P2P-3WAY — No 3-way match engine
**ETA:** 1.5 weeks
**Project:** onyx-procurement
**Source:** QA-18 UAT Process 1
**Required:** Reconciliation service that matches PO + GRN + supplier invoice on qty/price/tolerance and produces an exception queue.

### 30. QA18-UAT-AP — No accounts payable / supplier invoice intake
**ETA:** 1.5 weeks
**Project:** onyx-procurement
**Source:** QA-18 UAT Process 1
**Required:** `supplier_invoices` header table with `po_id` FK + line-items. Bank reconciliation migration 006 already references this table but it doesn't exist — fix the missing referent.

### 31. QA18-UAT-GL — No journal_entries / general ledger
**ETA:** 3 weeks
**Project:** onyx-procurement
**Source:** QA-18 UAT Process 4
**Required:** Double-entry `journal_entries(id, date, description, debit_account, credit_account, amount, period_id)` + `chart_of_accounts` + `accounting_periods(id, year, month, status='open|closed|locked', closed_by, closed_at)`. The Form 1320 builder currently pulls numbers directly from invoices — move it onto the GL.

### 32. QA18-UAT-Masav — No Masav / UTF8-2400 bank file generator
**ETA:** 1 week
**Project:** onyx-procurement
**Source:** QA-18 UAT Process 2
**Required:** Export module that produces a compliant Masav batch file for paying 30-50 employees + suppliers. No more manual bank typing.

### 33. QA18-UAT-Form102 — No Form 102 (monthly withholding)
**ETA:** 3 days
**Project:** onyx-procurement
**Source:** QA-18 UAT Process 2
**Required:** `POST /api/tax/form-102` that aggregates monthly BL + income-tax withholding from the wage-slip dataset.

### 34. QA18-UAT-AllocationAPI — No Invoice Reform allocation-number API call
**ETA:** 1 week (partial duplicate of B-09 but specifically the outbound-invoice side)
**Project:** onyx-procurement
**Source:** QA-18 UAT Process 3
**Required:** The columns `allocation_number` / `allocation_verified` exist in schema but no code ever calls רשות המסים to obtain a number for outgoing invoices ≥ ₪25,000. From 2025, that invoice is not legally issuable.

### 35. QA18-UAT-Consolidation — No consolidated P&L between factory and real estate
**ETA:** 1 week
**Project:** onyx-procurement + rent module
**Source:** QA-18 UAT Process 6
**Required:** Consolidation view + `rent_invoices`, `rent_receipts`, monthly auto-issue cron.

**Phase 3 total (updated): ~12–16 weeks of compliance + business-process engineering.**

---

## Cross-reference index

Every blocker here also appears in `QA-19-release-readiness.md` §3.1 with its original source citation. No finding was invented in this file — each row is a re-filing of a prior agent's finding (24 rows) or a direct re-verification by QA-19 (3 rows: BLOCKER-A, B, C) or a process observation (BLOCKER-D).

Closing any row in this file also closes the corresponding row in:
- `QA-WAVE1.5-MEGA-UNIFIED-REPORT.md`
- The individual `QA-AGENT-XX-*.md` file noted under each row's **Source** field.

---

## Exit criteria

CONDITIONAL GO to dev/VPN environment is unlocked when every **Phase 0A + Phase 0B + Phase 0C** row above is green (~42h of work).

GO to production is unlocked when every row in this file (all 45+) is green **and** the 50 still-running Wave 1.5 agents have reported with no new Critical findings **and** the remediation for QA18-UAT business-process blockers is signed off by the owner/accountant.

Sign nothing until then.
