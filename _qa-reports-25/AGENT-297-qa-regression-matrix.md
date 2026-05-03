# AGENT-297 — QA Regression Test Matrix per Release

**Agent:** 297 (QA Wave 7)
**Date:** 2026-04-29
**Owner:** kobi.ellkayam@technokoluzi.com
**Scope:** Techno-Kol Uzi ERP 2026 — Release Regression Matrix
**Branch:** claude/objective-merkle-40ff93
**Working dir:** `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93`

---

## 1. Purpose

Define the canonical regression test set that MUST be executed prior to every release of the
4-service ERP (TECHNO_KOL_OPS / ONYX_PROCUREMENT / PAYROLL_AUTONOMOUS / ONYX_AI). Each row
maps a category of risk to one or more test specs and marks current coverage state. Required
categories (per Agent 297 brief): **auth, GL postings, VAT calc, payroll, RLS isolation,
payment flows**. Two cross-cutting categories are added (state machines, audit trail) because
they regress silently and the system contract depends on them.

## 2. Coverage legend

| Mark | Meaning |
|------|---------|
| FULL | Test exists, currently green in CI, asserts the named contract end-to-end |
| PART | Test exists but covers a subset of cases (edge cases or one tenant only) |
| GAP  | No automated test found — manual or missing |
| BLOCK | Test exists but currently failing / quarantined / skipped |

## 3. Release gates

A release MUST NOT ship if any **P0** row is `GAP` or `BLOCK`. P1 rows may ship with
documented waiver. P2 rows are tracked but non-blocking.

---

## 4. Auth (P0)

| ID | Test | File | Coverage | Notes |
|----|------|------|----------|-------|
| AUTH-01 | Login success + JWT issued, exp/iat correct | `test/integration/qa-03-auth-matrix.test.js` | FULL | Covers ops, procurement, payroll, ai |
| AUTH-02 | Login failure: wrong password, locked user, disabled tenant | `test/integration/qa-03-auth-matrix.test.js` | FULL | 3 negative branches |
| AUTH-03 | Refresh token rotation + reuse-detection revokes family | `test/integration/qa-03-auth-matrix.test.js` | PART | Reuse-detection branch is TODO |
| AUTH-04 | TOTP / 2FA enrollment + verification | `test/payroll/totp.test.js` | FULL | Backup codes covered |
| AUTH-05 | RBAC: forbidden role cannot hit POST /api/orchestrator/execute | `test/security/qa-12-rbac.test.js` | FULL | 19 route groups exercised |
| AUTH-06 | Session expiry kicks user out + audit log entry | manual | GAP | Add to `test/integration` |
| AUTH-07 | CSRF token enforced on state-changing routes | `test/security/qa-12-rbac.test.js` | PART | Only POST/PUT, missing PATCH |
| AUTH-08 | Webhook HMAC signature verified | `test/integration/qa-03-webhook-hmac.test.js` | FULL | Replay window asserted |
| AUTH-09 | Cross-service JWT propagation (ops -> procurement) | `test/integration/qa-03-procurement-bridge.test.js` | FULL | 7 cross-service contracts |
| AUTH-10 | Password reset flow + token single-use | manual | GAP | Add to `test/integration` |

**Auth coverage: 7 FULL / 2 PART / 2 GAP**

---

## 5. GL Postings (P0)

| ID | Test | File | Coverage | Notes |
|----|------|------|----------|-------|
| GL-01 | Invoice posting hits AR + Revenue + VAT-Output, balanced | `test/finance/financial-statements.test.js` (via consolidator) | PART | Asserts totals, not per-line journal |
| GL-02 | PO receipt -> Inventory Dr / GR-IR Cr | `test/api/qa-08-purchase-orders.test.js` | PART | Stub journal; needs real ledger probe |
| GL-03 | Supplier invoice match -> GR-IR Dr / AP Cr | `test/api/qa-08-purchase-orders.test.js` | PART | Same as above |
| GL-04 | Payment posting -> AP Dr / Cash Cr + bank statement match | `test/finance/check-register.test.js` | FULL | |
| GL-05 | Journal balanced (sum debit = sum credit) on every transaction | `test/db/qa-09-integrity.test.js` | FULL | DB constraint + invariant probe |
| GL-06 | Reversal entry creates symmetric counter-posting | `test/finance/bad-debt-provision.test.js` | PART | Provision only, not generic reversal |
| GL-07 | Period close locks prior-period postings | manual | GAP | Add `test/finance/period-close.test.js` |
| GL-08 | FX revaluation on month-end re-rates AR/AP balances | `test/finance/fx-hedging.test.js` | PART | Hedging only; reval missing |
| GL-09 | Intercompany elimination (consolidation) | `test/payroll/consolidator.test.js`, `test/wiring/grand-consolidator.test.js` | FULL | |
| GL-10 | Trial balance reconciles to financial statements | `test/finance/financial-statements.test.js` | FULL | |

**GL coverage: 4 FULL / 5 PART / 1 GAP**

---

## 6. VAT Calculation (P0)

| ID | Test | File | Coverage | Notes |
|----|------|------|----------|-------|
| VAT-01 | Standard 17% on domestic sale (2026 rate) | `test/vat-routes.test.js` | FULL | Israeli rate locked |
| VAT-02 | Zero-rate export invoice — VAT line 0, but recorded | `test/vat-routes.test.js` | FULL | |
| VAT-03 | Exempt transaction — no VAT line, audit reason captured | `test/vat-routes.test.js` | PART | Reason text not asserted |
| VAT-04 | Reverse-charge import — VAT-Output + VAT-Input both posted | `test/regression/qa-05-vat-routes.test.js` | FULL | |
| VAT-05 | Mixed-rate invoice (lines at 17% + 0%) | `test/vat-routes.test.js` | FULL | |
| VAT-06 | PCN874 file generation matches GL totals | `test/pcn836.test.js` | FULL | pcn836 + 874 share encoder |
| VAT-07 | PCN836 (annual) encoder format compliance | `test/regression/qa-05-pcn836-encoder.test.js`, `test/integration/qa-03-pcn836-encoding.test.js`, `test/unit/qa-02-pcn836.test.js` | FULL | Triple coverage |
| VAT-08 | VAT refund flow + Form 836 | `test/tax/vat-refund.test.js` | FULL | |
| VAT-09 | Quarterly VAT report reconciles to monthly filings | `test/quarterly-tax-report.test.js`, `test/annual-tax-routes.test.js` | FULL | |
| VAT-10 | Money precision: agorot rounding (banker's rounding, 2026) | manual | GAP | High-risk gap; add unit test |

**VAT coverage: 8 FULL / 1 PART / 1 GAP**

---

## 7. Payroll (P0)

| ID | Test | File | Coverage | Notes |
|----|------|------|----------|-------|
| PAY-01 | Wage slip calculator: gross -> net (Israeli 2026) | `test/wage-slip-calculator.test.js`, `test/unit/qa-02-wage-slip-calculator.test.js`, `test/regression/qa-05-payroll-calculator.test.js` | FULL | Triple coverage |
| PAY-02 | Bituach Leumi brackets (2026) | `test/regression/qa-05-payroll-calculator.test.js` | FULL | |
| PAY-03 | Income tax brackets + credits (Form 101 driven) | `test/regression/qa-05-tax-forms.test.js` | FULL | |
| PAY-04 | Pension contribution: employer + employee + study fund | `test/pension/section-14.test.js`, `test/pension/severance-tracker.test.js` | FULL | |
| PAY-05 | Severance accrual + Section 14 release | `test/pension/section-14.test.js` | FULL | |
| PAY-06 | Vacation + sick day accrual | manual | GAP | Add to `test/payroll` |
| PAY-07 | Maternity leave + Bituach Leumi reimbursement | manual | GAP | Spec exists in QA-AGENT-93 only |
| PAY-08 | Foreign worker tax treatment (no credits) | manual | GAP | Spec QA-AGENT-94, no test |
| PAY-09 | Form 102 monthly filing | `test/tax/form-102.test.js` | FULL | |
| PAY-10 | Form 126 annual reconciliation | `test/tax/form-126.test.js` | FULL | |
| PAY-11 | Form 30A (Bituach Leumi) | `test/tax/form-30a.test.js` | FULL | |
| PAY-12 | MASAV bank file generation for net pay | `test/payroll-routes.test.js`, `test/e2e/qa-04-payroll.test.js` | FULL | |
| PAY-13 | Payroll frontend e2e: run -> approve -> post -> file -> pay | `test/integration/qa-03-payroll-frontend.test.js`, `test/e2e/qa-04-payroll.test.js` | FULL | |
| PAY-14 | Hebrew calendar integration (chag/shabbat affecting pay date) | manual | GAP | Spec QA-AGENT-136 |

**Payroll coverage: 10 FULL / 0 PART / 4 GAP**

---

## 8. RLS Isolation (P0)

| ID | Test | File | Coverage | Notes |
|----|------|------|----------|-------|
| RLS-01 | Tenant A user CANNOT read tenant B rows (customers) | `test/wiring/tenant-config.test.js` | PART | Customers + suppliers only |
| RLS-02 | Tenant A CANNOT update tenant B rows | `test/security/qa-12-rbac.test.js` | PART | Hard-coded 2 tenants |
| RLS-03 | Cross-tenant join blocked at DB level (RLS policy) | `test/db/qa-09-integrity.test.js` | FULL | Policy presence + behavior |
| RLS-04 | Service-role bypass restricted to migrations / system jobs | `test/db/migrator.test.js` | PART | Bypass list not enumerated |
| RLS-05 | Multi-tenant in payroll: per-company wage slip isolation | `test/payroll/company-id.test.js` | FULL | |
| RLS-06 | Reports / consolidations respect RLS but allow group-parent | `test/wiring/grand-consolidator.test.js` | FULL | |
| RLS-07 | RLS active on all 16 entities from `entity-map.js` | manual | GAP | Programmatic audit needed |
| RLS-08 | Storage / file uploads scoped to tenant prefix | manual | GAP | Spec QA-AGENT-47 |
| RLS-09 | AI / Onyx-AI queries scoped to caller tenant | `test/integration/qa-03-ai-bridge.test.js` | PART | One model only |
| RLS-10 | Audit log row-level reads filtered by tenant | manual | GAP | Spec QA-AGENT-50 |

**RLS coverage: 3 FULL / 4 PART / 3 GAP**

---

## 9. Payment Flows (P0)

| ID | Test | File | Coverage | Notes |
|----|------|------|----------|-------|
| PMT-01 | Customer payment received -> AR clears -> invoice CLOSED state | `test/finance/aging.test.js`, `test/finance/aging-reports.test.js` | FULL | |
| PMT-02 | Supplier payment run: select invoices -> wire -> approve -> execute | `test/finance/wire-transfer.test.js`, `test/finance/wire-approval.test.js` | FULL | |
| PMT-03 | Bank reconciliation auto-match (statement vs ledger) | `test/bank-matcher.test.js`, `test/bank-routes.test.js`, `test/payroll/bank-reconciliation.test.js`, `test/e2e/qa-04-bank-recon.test.js`, `test/integration/qa-03-bank-upload.test.js`, `test/regression/qa-05-bank-matcher.test.js` | FULL | 6-way coverage |
| PMT-04 | Bank parser: supports all enrolled banks | `test/bank-parsers.test.js` | FULL | |
| PMT-05 | MASAV outbound payment file (Israeli ACH equivalent) | `test/payroll-routes.test.js` | FULL | Spec QA-AGENT-135 |
| PMT-06 | Check printing + check register reconciliation | `test/finance/check-register.test.js`, `test/payroll/check-printer.test.js` | FULL | |
| PMT-07 | Wire approval workflow (multi-signatory threshold) | `test/finance/wire-approval.test.js`, `test/finance/signatory-workflow.test.js` | FULL | |
| PMT-08 | Failed payment -> retry policy + dunning escalation | `test/payroll/dunning.test.js` | FULL | |
| PMT-09 | Payment gateway integration (provider-side webhook) | `test/integration/qa-03-webhook-hmac.test.js` | PART | HMAC only, not full E2E |
| PMT-10 | Cross-currency payment + FX rate at value date | `test/finance/fx-hedging.test.js` | PART | Hedge only, no value-date test |
| PMT-11 | Refund flow -> reverse posting + audit | manual | GAP | High-risk |
| PMT-12 | Duplicate payment detection | `test/payroll/duplicate-detector.test.js`, `test/payroll/fraud-rules.test.js` | FULL | |

**Payment coverage: 9 FULL / 2 PART / 1 GAP**

---

## 10. Cross-cutting (P1)

| ID | Test | File | Coverage | Notes |
|----|------|------|----------|-------|
| SM-01 | All 13 state machines: 91 transitions reachable + invalid blocked | `test/wiring/event-bus.test.js`, `test/e2e/seed-flows.test.js`, QA-AGENT-37 spec | PART | Spec + smoke; no exhaustive enumerator |
| SM-02 | Workflow flows: 5 business flows reach Closure | `test/e2e/qa-04-cross-project.test.js`, `test/e2e/seed-flows.test.js` | FULL | Master Flow Lead -> Closure |
| AUD-01 | Audit log written for every orchestrator action (18 actions) | `test/api/qa-08-analytics-audit.test.js` | PART | Spot-checks 3 of 18 |
| AUD-02 | Audit log immutable (no UPDATE / DELETE) | `test/db/qa-09-integrity.test.js` | FULL | Trigger + RLS deny |
| AUD-03 | 360 pages emit audit on view (PII-sensitive) | manual | GAP | Spec QA-AGENT-50 |
| RUN-01 | Service health probes (all 4 services) | `test/api/qa-08-health-probes.test.js`, `_qa-reports-25/AGENT-112-health.md` | FULL | |
| RUN-02 | Migration safety (forward + rollback) | `test/db/migrator.test.js` | FULL | |
| RUN-03 | Backup + restore drill | manual | GAP | Spec QA-AGENT-18 |

**Cross-cutting coverage: 4 FULL / 2 PART / 2 GAP**

---

## 11. Roll-up & top GAPs

| Category | FULL | PART | GAP | BLOCK | P0 ready? |
|----------|------|------|-----|-------|-----------|
| Auth | 7 | 2 | 2 | 0 | NO (AUTH-06, AUTH-10) |
| GL postings | 4 | 5 | 1 | 0 | NO (GL-07 period close) |
| VAT | 8 | 1 | 1 | 0 | NO (VAT-10 agorot rounding) |
| Payroll | 10 | 0 | 4 | 0 | NO (PAY-06/07/08/14) |
| RLS | 3 | 4 | 3 | 0 | NO (RLS-07/08/10) |
| Payments | 9 | 2 | 1 | 0 | NO (PMT-11 refund) |
| Cross-cutting (P1) | 4 | 2 | 2 | 0 | acceptable |
| **Total** | **45** | **16** | **14** | **0** | **NO** |

**Top 5 highest-risk GAPs blocking release:**
1. **VAT-10** — agorot rounding not asserted; even single-cent drift fails PCN reconciliation
2. **PMT-11** — refund flow has no automated test; reversal is the most error-prone GL operation
3. **GL-07** — period close lock; without it, prior-period mutation breaks audit trail
4. **RLS-07** — RLS policy presence not audited across all 16 entities; new entity = silent leak
5. **PAY-06 / PAY-07** — vacation/sick + maternity arithmetic; legally mandated, currently manual

## 12. Run order per release

```
1. Unit + regression       npm -w onyx-procurement run test:unit
2. DB integrity + RLS      npm -w onyx-procurement run test:db
3. Integration + auth      npm -w onyx-procurement run test:integration
4. Security + RBAC         npm -w onyx-procurement run test:security
5. Finance + tax + VAT     npm -w onyx-procurement run test:finance
6. Payroll                 npm -w onyx-procurement run test:payroll
7. E2E + workflow flows    npm -w onyx-procurement run test:e2e
8. Smoke / health probes   curl /healthz on ports 3100/3200/3300/5173
```

Aggregate runner: `onyx-procurement/test/run-all.js` (entry point already wired).

## 13. Deliverable for Wave 7

- File: `_qa-reports-25/AGENT-297-qa-regression-matrix.md` (this document)
- Action: file 14 GAP tickets in QA backlog, link to specs `QA-AGENT-*`
- Owner approval gate: 6 P0 categories must reach 0 GAP before next release-tag

---

*End of AGENT-297 regression matrix.*
