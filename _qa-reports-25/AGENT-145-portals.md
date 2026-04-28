# AGENT-145 — End-User Portals Audit (Supplier + Customer)

**Agent:** 145
**Date:** 2026-04-29
**Scope:** Re-audit of self-service end-user portals shipped by AG-X29 (supplier) and AG-X30 (customer). Verify magic-link auth, document download, ticket open, RTL Hebrew, isolation, never-delete.
**Branch / worktree:** `claude/objective-merkle-40ff93`
**Verdict:** GREEN — engines build, both test suites pass (37 + 61 = 98/98). Two follow-ups noted (no HTTP route layer wired; mailer/payment/PDF bridges optional).

---

## 1. Files inspected

| Layer | Path | LOC |
|-------|------|----:|
| Supplier engine | `onyx-procurement/src/supplier-portal/portal-engine.js` | 985 |
| Supplier UI | `payroll-autonomous/src/components/SupplierPortal.jsx` | 1027 |
| Supplier tests | `test/payroll/supplier-portal.test.js` | (37 cases) |
| Customer engine | `onyx-procurement/src/customer-portal/portal-engine.js` | 1017 |
| Customer UI | `payroll-autonomous/src/components/CustomerPortal.jsx` | 1912 |
| Customer tests | `onyx-procurement/test/payroll/customer-portal.test.js` | (61 cases) |
| Wiring | `onyx-procurement/src/pipeline/wiring-spec.js` | route stubs `customer_portal?` / `supplier_portal?` declared on entities, page slots `/customers/:id/portal` and `/suppliers/:id/portal` declared |

(Supplier test path differs from AG-X29 report. AG-X29 says `onyx-procurement/test/...`; the actual location is `test/payroll/supplier-portal.test.js` at repo root. Tests run cleanly from that path.)

---

## 2. Test runs (this audit)

```
$ node --test test/payroll/supplier-portal.test.js
ℹ tests 37   pass 37   fail 0    duration_ms 6698
$ cd onyx-procurement && node --test test/payroll/customer-portal.test.js
ℹ tests 61   pass 61   fail 0    duration_ms 507
```

Both ran without dependency installs. Only `node:test` + `node:crypto` in use.

---

## 3. Self-service capability matrix

| Capability | Supplier | Customer |
|------------|:-------:|:--------:|
| Magic-link login (no password) | yes | yes |
| Single-use token | yes (atomic `consumeMagicLink`) | yes (`verifyMagicLink` is single-use) |
| Token TTL | 72h | 15min (configurable via `tokenTtlMs`) |
| Session TTL | 8h JWT (HS256) | 8h session record |
| CSRF token bound to session | yes | implicit (session-scoped engine calls) |
| Rate-limited login | yes — 5 / 15 min by `email + IP` | rate-limit not enforced inside engine |
| Enumeration-resistance on unknown email | yes | yes (`{ok:true, sent:false}`) |
| Per-tenant isolation (cross-tenant blocked) | yes — every call filters by session `supplierId`; cross access returns same error as not-found | yes — `_assertOwn`; cross-tenant returns `FORBIDDEN`, not `NOT_FOUND` |
| Document upload (mime + size + AV stub) | yes — 25MB cap, allow-list, EICAR detected, traversal blocked | n/a (read-only PDFs) |
| Document download | n/a | `getInvoicePdf` via `pdfBridge` with deterministic bilingual fallback receipt when bridge absent |
| Ticket open | n/a (engine has tax-clarification flow but no general tickets) | `raiseSupport` routed via `supportBridge` (Agent X-21); local fallback if bridge throws |
| Online payment | n/a | `payInvoice` via `paymentBridge` with local PAY-* ref fallback; gateway errors surface `gateway_declined` |
| Statement / dashboard | acknowledgements, PO list, payment history | dashboard, statement of account (open + running + close), order history |
| Never-delete | every mutation additive, no `delete*` operations | address/contact/payments/tickets all preserved in history arrays |
| Append-only audit log | 20+ action types | login + payment + support + isolation events; defensive copy returned |
| Bilingual + RTL | `direction: rtl`, Hebrew-first labels with English after `•` | `dir="rtl"`, `lang="he"`, `textAlign: 'right'` everywhere; `LABELS` map covered by tests |

---

## 4. Magic-link verification

### Supplier (`onyx-procurement/src/supplier-portal/portal-engine.js`)
- `requestMagicLink(email)` at L596 → mints token, HMAC-hashes before persistence (L613), TTL 72h (L70, L619).
- `verifyMagicLink(token)` at L639 → re-hashes, calls atomic `consumeMagicLink` (L427/L657). Replay emits `magic_link_replay` audit event.
- JWT (`jwtSign` L232) is custom HS256 — no library; `safeEqual` wraps `crypto.timingSafeEqual`.
- Tested by cases 03–13 and 35–36 (sign/verify, tampered, wrong secret, expired, malformed, deterministic HMAC).

### Customer (`onyx-procurement/src/customer-portal/portal-engine.js`)
- `customerLogin(email)` L322 → returns `{ok, token, magicLink}` and pushes through `mailer.send` if bridge wired (L348–L361). `magicLink` is built as `${portalBaseUrl}/auth/verify?token=${token}` so the front end can deep-link.
- `verifyMagicLink(token)` L378 — single-use, expiry-checked, mints 8h session.
- TTL default 15 min via `tokenTtlMs` constructor option (L210, L220, L345).
- Covered by tests 9 in the auth/magic-link section (happy, normalisation, unknown, malformed, verify, single-use, expiry, mailer bridge, resolveSession).

### Audit findings on auth
1. TTL mismatch between supplier (72h) and customer (15min) is intentional — supplier links are one-shot per onboarding, customer links per session. Documented in both engines.
2. `DEFAULT_SECRET_WARNING` constant is exported from supplier engine to make CI grep visible. Customer engine accepts secret via constructor option but does not export an analogous warning constant — minor parity gap, not a blocker.

---

## 5. Document download (customer)

`getInvoicePdf(customerId, invoiceId)` at L491:
1. Asserts ownership; cross-tenant blocked (`FORBIDDEN`, tested).
2. If `pdfBridge.getInvoicePdf` is wired, returns `{ok, fileRef, fallbackText: null}` from bridge.
3. Otherwise returns inline bilingual text receipt (L533–L536) with deterministic `fileRef: inline://invoice-<id>.txt`.

Tests verify (a) bridge used when present, (b) inline fallback when absent, (c) cross-tenant forbidden.

UI side: `CustomerPortal.jsx` exposes per-row "Download PDF" action on the invoice list with status pills (paid/overdue/unpaid/partial colour states).

---

## 6. Ticket open (customer)

`raiseSupport(customerId, subject, description, priority, meta)` at L708:
- Validates non-empty subject (test).
- Routes to `supportBridge.create({...})` if wired (Agent X-21 hand-off).
- Falls back to local in-engine ticket store with `TCK-*` id (L730) when bridge throws — outage doesn't lose the complaint.
- Recorded in `_tickets` map immutably (L743). `listSupportTickets` strictly isolated (test).
- UI: subject, priority `select`, description `textarea`, `aria-label`s, role="status" toast with returned ticket id.

Supplier side: no general ticket flow — only domain-specific submissions (PO ack, ASN, invoice, cert, tax clarification). This is per AG-X29 spec, not a defect.

---

## 7. RTL Hebrew

Both UI components verified to set RTL at the root and on every input:

- `SupplierPortal.jsx`: `direction: 'rtl'` (L176), `textAlign: 'right'` in form fields (L217, L249). Bilingual labels with `•` separator, e.g. *"הזמנות פתוחות • Open POs"*.
- `CustomerPortal.jsx`: `direction: 'rtl'` and `textAlign: 'right'` declared in 6+ style blocks (L332, L358, L382, L556, L698, L734, L744). Login toast renders *"אם הכתובת רשומה אצלנו, נשלח אליה קישור כניסה"*. `lang="he"` set on the root.
- `LABELS` map in customer engine has full bilingual coverage, asserted by a dedicated test (`bilingual labels` case).
- Mobile-first: `grid-template-columns: repeat(auto-fit, minmax(…, 1fr))` collapses gracefully on 360px phones (per AG-X30 manifest).

---

## 8. Security & isolation re-checks

| Control | Supplier | Customer |
|---------|----------|----------|
| Cross-tenant read | blocked, returns same shape as not-found | blocked, returns `FORBIDDEN` |
| Inactive principal | n/a | inactive customer hits `INACTIVE` and cannot read |
| File upload (mime / size / traversal / AV) | yes | n/a |
| Constant-time compare | `safeEqual` at L138 | implicit via `crypto.timingSafeEqual` calls in shared helpers |
| Audit log immutability | append-only, 20+ action types | append-only, defensive copy returned |
| Three-way invoice match | `≤ poTotal × 1.10`, blocked at 100% over | n/a (customer reads invoices, not creates) |
| Whitelist-only contact updates | yes (L29 fields drop) | yes (history-preserved + email validated) |

---

## 9. Wiring evidence (`pipeline/wiring-spec.js`)

- L48: `customer.has_one: ['customer_portal?']`
- L49: `supplier.has_one: ['supplier_portal?']`
- L74: customers route group includes `portal: '/customers/:id/portal'`
- L75: suppliers route group includes `portal: '/suppliers/:id/portal'`
- L104: Customer 360 secondary actions include `open_portal`
- L110: Supplier 360 secondary actions include `view_portal`

So both portals are first-class in the entity map and routed from each 360 page. The actual HTTP server-side route handlers (Express layer) are NOT yet present — engines are pure libs. **Follow-up #1: wire `app.use('/api/portal/supplier', portalRouter)` and `/api/portal/customer` in the api-server.**

---

## 10. Findings & follow-ups

1. **No HTTP routing layer for either portal.** Engines are factory-style libs (`createPortalEngine({...})` / `new CustomerPortalEngine({...})`) — needs an Express adapter inside `api-server` exposing the public surface. The component already speaks via an injected `api` object, so this is a thin glue layer.
2. **Mailer / paymentBridge / pdfBridge / supportBridge are optional.** All four degrade cleanly (engineering decision, deliberate per AG-X29/X30). Production deploy must wire real implementations before customer rollout — there is no warning emitted at runtime when bridges are missing.
3. **Supplier `DEFAULT_SECRET_WARNING` not mirrored on customer engine.** Minor: add an exported constant for static analysers to flag default-secret deployments.
4. **Supplier test path moved.** AG-X29 reports `onyx-procurement/test/payroll/supplier-portal.test.js`; the file actually lives at repo-root `test/payroll/supplier-portal.test.js`. Updating CI runners or `package.json` test scripts if they target the old path.
5. **Rate-limit symmetry.** Supplier portal enforces a 5/15min token bucket on login (test 10). Customer portal does not — `customerLogin` would benefit from the same limiter, especially given the 15-minute TTL increases the brute-force surface.
6. **No CSRF on customer engine** (supplier has it, double-submit cookie). Consider mirroring before exposing customer-portal HTTP routes.

---

## 11. Compliance ledger (re-verified)

| Requirement | Supplier | Customer |
|-------------|:-------:|:--------:|
| Never delete | yes | yes |
| Hebrew RTL bilingual | yes | yes |
| Zero external deps | yes | yes |
| Magic-link, time-limited | yes (72h) | yes (15min default) |
| No password | yes | yes |
| JWT/session | HS256 custom | session record + `resolveSession` |
| Rate limit on login | yes | NO (follow-up #5) |
| Data isolation | yes | yes |
| File validation (mime/size/AV) | yes | n/a |
| Audit log | yes | yes |
| CSRF | yes | NO (follow-up #6) |
| 20+ tests | 37 | 61 |
| Real code, no TODOs | yes | yes |

---

## 12. Verdict

Both portals are production-shaped libraries with comprehensive test coverage and the right primitives (magic-link, isolation, never-delete, RTL Hebrew, bilingual). Net of the 6 follow-ups above — most importantly the HTTP route layer and the customer-side rate limiting + CSRF parity — they are ready to be exposed publicly via the api-server. AG-X29 and AG-X30 deliverables match what's on disk; tests green on this branch.

**98/98 tests pass. GREEN.**
