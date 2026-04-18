# QA-19 — Release Sign-Off Form

**System:** Kobi Elkayam / Techno-Kol Uzi — ERP 2026
**Release candidate:** (fill in: git SHA / tag / branch)
**Target environment:** ☐ Local dev ☐ Dev + VPN (closed) ☐ Staging ☐ Production
**Target deployment date:** ____ / ____ / 2026
**Prepared by QA-19:** 2026-04-11

---

## 0. Precondition statement (read before signing)

By signing below, each party affirms that they have personally read:

1. `_qa-reports/QA-19-release-readiness.md` — full Go/No-Go report.
2. `_qa-reports/QA-19-blockers.md` — the 27 blocker rows.
3. `onyx-procurement/QA-WAVE1.5-MEGA-UNIFIED-REPORT.md` — the 95-agent synthesis.
4. `COMPLIANCE_CHECKLIST.md` — legal exposure matrix.
5. `OPS_RUNBOOK.md` and `onyx-procurement/DR_RUNBOOK.md`.

and understand that QA-19 has issued the following verdict at report time:

> ## ⛔ NO-GO FOR PRODUCTION
> ## 🟡 CONDITIONAL GO FOR DEV/VPN (after Phase 0A + 0B)
> ## 🟢 GO FOR LOCAL DEVELOPMENT

---

## 1. Blocker-by-blocker closure attestation

This form **may not** be signed unless every row below is marked `CLOSED` with a commit SHA, or explicitly `WAIVED` with a written risk acceptance by the business owner.

### 1.1 Phase 0A — 12 fast wins (required for any deployment beyond local dev)

| # | ID | Title | Status | Commit SHA | Closed by | Date |
|---|---|---|---|---|---|---|
| 1 | QA-19-BLOCKER-A | Wire `security.js` into techno-kol-ops/src/index.ts | ☐ CLOSED ☐ WAIVED ☐ OPEN | | | |
| 2 | B-24 | `APP_URL` in techno-kol-ops `.env.example` | ☐ CLOSED ☐ WAIVED ☐ OPEN | | | |
| 3 | B-23 | onyx-procurement Supabase env validator + explicit exit | ☐ CLOSED ☐ WAIVED ☐ OPEN | | | |
| 4 | B-02 / F-07 | Dashboard `const API` dynamic | ☐ CLOSED ☐ WAIVED ☐ OPEN | | | |
| 5 | B-05 | VAT rate 17% via env + history table | ☐ CLOSED ☐ WAIVED ☐ OPEN | | | |
| 6 | B-12 | PO `status='sent'` conditional on WhatsApp success | ☐ CLOSED ☐ WAIVED ☐ OPEN | | | |
| 7 | B-06 | PO `subtotal` computed from line items | ☐ CLOSED ☐ WAIVED ☐ OPEN | | | |
| 8 | B-17 | `express-rate-limit` installed + wired | ☐ CLOSED ☐ WAIVED ☐ OPEN | | | |
| 9 | QA-19-BLOCKER-B | techno-kol-ops `start` resolves (tsx or prestart build) | ☐ CLOSED ☐ WAIVED ☐ OPEN | | | |
| 10 | B-20 | onyx-ai `prestart: npm run build` + `dist/` present | ☐ CLOSED ☐ WAIVED ☐ OPEN | | | |
| 11 | B-21 | techno-kol-ops/client `tsconfig.node.json` created | ☐ CLOSED ☐ WAIVED ☐ OPEN | | | |
| 12 | B-22 | onyx-ai default port 3200 (no collision) | ☐ CLOSED ☐ WAIVED ☐ OPEN | | | |

### 1.2 Phase 0B — 8 security + audit + state rows (required for dev/VPN)

| # | ID | Title | Status | Commit SHA | Closed by | Date |
|---|---|---|---|---|---|---|
| 13 | B-03 | Supabase Auth + RLS on onyx-procurement | ☐ CLOSED ☐ WAIVED ☐ OPEN | | | |
| 14 | B-04 | WhatsApp webhook HMAC verify | ☐ CLOSED ☐ WAIVED ☐ OPEN | | | |
| 15 | B-15 | `rfq/:id/decide` IDOR guard + clamp + JWT actor | ☐ CLOSED ☐ WAIVED ☐ OPEN | | | |
| 16 | B-16 | Server-side Supabase client on `SERVICE_ROLE` (not ANON) | ☐ CLOSED ☐ WAIVED ☐ OPEN | | | |
| 17 | B-13 | Audit wired to 4 subcontractor + supplier-product endpoints | ☐ CLOSED ☐ WAIVED ☐ OPEN | | | |
| 18 | B-14 | `schema_migrations` table + idempotent runner | ☐ CLOSED ☐ WAIVED ☐ OPEN | | | |
| 19 | B-18 | PO state machine either implemented or CHECK trimmed | ☐ CLOSED ☐ WAIVED ☐ OPEN | | | |
| 20 | B-19 | onyx-ai `new OnyxPlatform().start()` bootstrap | ☐ CLOSED ☐ WAIVED ☐ OPEN | | | |

### 1.2b Phase 0C — 18 sibling-agent Critical rows (also required for dev/VPN)

Added 2026-04-11 after ingesting QA-01, QA-10, QA-11, QA-12, QA-13, QA-17, QA-18, QA-20 reports.

| # | ID | Title | Status | Commit SHA | Closed by | Date |
|---|---|---|---|---|---|---|
| 21 | QA13-SEC-001 | Hardcoded super-admin passwords removed, rotated, env-driven seed | ☐ CLOSED ☐ WAIVED ☐ OPEN | | | |
| 22 | QA13-SEC-002 | Committed secrets scrubbed + rotated + JWTs invalidated | ☐ CLOSED ☐ WAIVED ☐ OPEN | | | |
| 23 | QA13-SEC-004 | SQL-i column-name interpolation fixed on 5 routes (allowlist) | ☐ CLOSED ☐ WAIVED ☐ OPEN | | | |
| 24 | QA13-SEC-005 | SQL-i table-name interpolation guard in ontology engine | ☐ CLOSED ☐ WAIVED ☐ OPEN | | | |
| 25 | QA13-SEC-009 | JWT_SECRET placeholder removed from `.env.example` | ☐ CLOSED ☐ WAIVED ☐ OPEN | | | |
| 26 | QA12-RBAC-002 | IDOR `GET /api/payroll/wage-slips/:id` — ownership guard | ☐ CLOSED ☐ WAIVED ☐ OPEN | | | |
| 27 | QA12-RBAC-003 | IDOR `GET /api/payroll/employees/:id/balances` — ownership guard | ☐ CLOSED ☐ WAIVED ☐ OPEN | | | |
| 28 | QA12-RBAC-004 | Mass-assignment `insert(req.body)` replaced with `pick(body, ALLOWED)` | ☐ CLOSED ☐ WAIVED ☐ OPEN | | | |
| 29 | QA12-RBAC-007 | Employee cannot self-approve own wage slip (four-eyes) | ☐ CLOSED ☐ WAIVED ☐ OPEN | | | |
| 30 | QA13-SEC-006 (jwt pinning) | `jwt.verify` pinned to `algorithms: ['HS256']` | ☐ CLOSED ☐ WAIVED ☐ OPEN | | | |
| 31 | QA11-UX-A04 | PDF wage slip issuance has confirmation + preview modal | ☐ CLOSED ☐ WAIVED ☐ OPEN | | | |
| 32 | QA11-UX-C01 | PCN836 submission has preview + explicit confirm step | ☐ CLOSED ☐ WAIVED ☐ OPEN | | | |
| 33 | QA11-UX-B08 / B09 | `+ עובד חדש` and `+ לקוח חדש` have working `onClick` | ☐ CLOSED ☐ WAIVED ☐ OPEN | | | |
| 34 | QA11-UX-B15 | HRAutonomy split into sub-routes | ☐ CLOSED ☐ WAIVED ☐ OPEN | | | |
| 35 | QA17-COMPAT-002 | `cross-env` installed + scripts updated for Windows | ☐ CLOSED ☐ WAIVED ☐ OPEN | | | |
| 36 | QA17-COMPAT-005 | Safari 14 polyfills for `Array.at` + `structuredClone` | ☐ CLOSED ☐ WAIVED ☐ OPEN | | | |
| 37 | QA17-A11Y-Z | Pinch-zoom enabled (Israeli a11y law 5758-1998) | ☐ CLOSED ☐ WAIVED ☐ OPEN | | | |
| 38 | QA20-MON | Real alert transports (email + WhatsApp/SMS) wired, not `console.log` | ☐ CLOSED ☐ WAIVED ☐ OPEN | | | |

### 1.3 Phase 3 — compliance + business-process rows (required for production)

| # | ID | Title | Status | Evidence artifact | Date |
|---|---|---|---|---|---|
| 39 | B-07 | Income tax module (QA-87) | ☐ CLOSED ☐ WAIVED ☐ OPEN | | |
| 40 | B-08 | Wage-slip 100/100 (QA-96) — Phases A+B+C | ☐ CLOSED ☐ WAIVED ☐ OPEN | | |
| 41 | B-09 | VAT module + PCN836 + Invoice Reform allocation numbers (QA-140) | ☐ CLOSED ☐ WAIVED ☐ OPEN | | |
| 42 | B-10 | Annual return module 1301/1320/6111 (QA-141) | ☐ CLOSED ☐ WAIVED ☐ OPEN | | |
| 43 | B-11 | Bank reconciliation module (QA-142) | ☐ CLOSED ☐ WAIVED ☐ OPEN | | |
| 44 | QA-19-BLOCKER-C | nexus_engine / paradigm_engine wired or re-classified | ☐ CLOSED ☐ WAIVED ☐ OPEN | | |
| 45 | QA-19-BLOCKER-D | `_qa-reports/` contains full QA corpus or manifest | ☐ CLOSED (auto — siblings landed) | QA-19 direct observation 2026-04-11 | |
| 46 | QA18-UAT-P2P-GRN | `goods_receipts` table + FK to purchase_orders.id | ☐ CLOSED ☐ WAIVED ☐ OPEN | | |
| 47 | QA18-UAT-P2P-3WAY | 3-way match engine (PO + GRN + supplier invoice) | ☐ CLOSED ☐ WAIVED ☐ OPEN | | |
| 48 | QA18-UAT-AP | `supplier_invoices` header + line-items with `po_id` FK | ☐ CLOSED ☐ WAIVED ☐ OPEN | | |
| 49 | QA18-UAT-GL | `journal_entries` + `chart_of_accounts` + `accounting_periods` | ☐ CLOSED ☐ WAIVED ☐ OPEN | | |
| 50 | QA18-UAT-Masav | Masav UTF8-2400 bank file exporter | ☐ CLOSED ☐ WAIVED ☐ OPEN | | |
| 51 | QA18-UAT-Form102 | Form 102 monthly withholding generator | ☐ CLOSED ☐ WAIVED ☐ OPEN | | |
| 52 | QA18-UAT-AllocationAPI | Outbound Invoice Reform allocation-number API client | ☐ CLOSED ☐ WAIVED ☐ OPEN | | |
| 53 | QA18-UAT-Consolidation | Factory + real estate consolidated P&L + rent invoice module | ☐ CLOSED ☐ WAIVED ☐ OPEN | | |

---

## 2. Gate checks (15 gates from the release readiness checklist)

| # | Gate | Required state for this deployment | Actual | Pass? |
|---|---|---|---|---|
| 1 | All tests executed | All 145 QA agents reported + runtime smoke on 5 projects | ____ | ☐ |
| 2 | 0 blockers | `_qa-reports/QA-19-blockers.md` all CLOSED or WAIVED | ____ | ☐ |
| 3 | < 5 High | Count from Wave 1.5 §3 | ____ | ☐ |
| 4 | Critical features tested (payroll, VAT, bank, annual tax) | Each > 80% structural + runtime regression | ____ | ☐ |
| 5 | Security audit clean | Pentest plan QA-30 all PTPs run + closed | ____ | ☐ |
| 6 | Perf under threshold | Load test 100 concurrent RFQ, 10K supplier bulk, WA queue 500 | ____ | ☐ |
| 7 | Runbook present | `OPS_RUNBOOK.md` + service-specific DR runbook | ____ | ☐ |
| 8 | Backup in place | `pg_dump` cron + S3 + restore test ≤ last 30 days | ____ | ☐ |
| 9 | Rollback plan | Documented + migration-level rollback + feature flags | ____ | ☐ |
| 10 | Compliance: Amendment 24, Invoice Reform 2024, PCN836, Form 1320 | 100% per `COMPLIANCE_CHECKLIST.md` | ____ | ☐ |
| 11 | RTL + Hebrew | `HEBREW_A11Y_AUDIT.md` → no FAIL rows | ____ | ☐ |
| 12 | Wage-slip PDF verified | QA-96 + QA-48 — sample PDF signed off by external payroll officer | ____ | ☐ |
| 13 | Migrations idempotent | All `.sql` files pass double-run test | ____ | ☐ |
| 14 | Audit log active | `SELECT count(*) FROM audit_logs WHERE created_at > NOW() - interval '1 hour'` > 0 from smoke test | ____ | ☐ |
| 15 | Rate limit + Helmet + CORS | Verified via live curl probes at 11th login → 429, bad Origin → 403 | ____ | ☐ |

---

## 3. Legal attestation (production only)

Only fill in for production-targeted releases.

I, the undersigned business owner, acknowledge that:

- [ ] I have read `COMPLIANCE_CHECKLIST.md` and understand the cumulative annual exposure estimate of **₪10M+** if any row is unmet.
- [ ] I have the signature of an external רו"ח or payroll officer confirming the wage-slip output is compliant with **חוק הגנת השכר תיקון 24**.
- [ ] I have confirmed with the pension fund(s) that the monthly contribution file format produced by `payroll-autonomous` is accepted.
- [ ] I have confirmed with רשות המסים that the PCN874 + PCN836 files generated by the VAT module are accepted via שע"מ.
- [ ] I understand that **any wage slip delivered late or incomplete to an employee** carries a per-slip administrative fine (see `COMPLIANCE_CHECKLIST.md` §1).
- [ ] I have appointed a ממונה אבטחת מידע (DPO) or documented why one is not required under תקנות אבטחת מידע 2017.

---

## 4. Signatures

**Signed only when every `OPEN` in section 1 is `CLOSED` or formally `WAIVED`.**

### 4.1 Engineering

Name: _____________________________
Role: Tech lead / owner of techno-kol-ops + onyx-procurement
Date: ____ / ____ / 2026
Signature: _____________________________

I attest that every code blocker in section 1.1 and 1.2 is closed on commit SHA(s) listed, and that the smoke tests of `_qa-reports/smoke/qa-06-smoke.js` pass `GO` on all 5 projects.

### 4.2 Compliance / Finance

Name: _____________________________
Role: External רו"ח or payroll officer
Date: ____ / ____ / 2026
Signature: _____________________________

I attest that the wage-slip sample, the VAT periodic report, and the annual return draft produced by this release candidate conform to 2026 Israeli law.

### 4.3 Security

Name: _____________________________
Role: Security reviewer (internal or external pentester)
Date: ____ / ____ / 2026
Signature: _____________________________

I attest that the 14 PTPs in QA-30 Pentest Plan have been executed against this build and each finding is documented as CLOSED or WAIVED in §1. I have personally verified B-03, B-04, B-15, B-16, B-17 in a live environment.

### 4.4 Business owner

Name: קובי אלקיים (Kobi Elkayam)
Role: Owner
Date: ____ / ____ / 2026
Signature: _____________________________

I accept the residual risk documented in §1 waivers (if any). I understand the verdict issued by QA-19 on 2026-04-11 and I am authorizing deployment to the target environment indicated at the top of this form.

---

## 5. QA-19 final stamp

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│     QA-19 VERDICT AT REPORT TIME (2026-04-11):              │
│                                                             │
│        Production:   NO-GO                                  │
│        Dev/VPN:      CONDITIONAL GO after Phase 0A+0B+0C    │
│        Local dev:    GO                                     │
│                                                             │
│        Score:        18 / 100  (after sibling ingest)       │
│        Blockers:     45+ open                               │
│        Highs:        60+                                    │
│                                                             │
│     Sibling agent votes:                                    │
│        QA-01, QA-06, QA-10, QA-11, QA-12, QA-13,            │
│        QA-17, QA-18, QA-19, QA-20  →  10 / 10 NO-GO         │
│                                                             │
│     This verdict is **not** overridable by signatures.      │
│     It only updates when the blockers list updates.         │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 6. Revision log

| Version | Date | Change | Author |
|---|---|---|---|
| 1.0 | 2026-04-11 | Initial QA-19 close-out | QA-19 Release Readiness Agent |

---

**End of QA-19 — sign-off form.** Keep alongside `QA-19-release-readiness.md` and `QA-19-blockers.md` in `_qa-reports/`. Do not edit historic signatures — append a new revision row if re-attestation is required.
