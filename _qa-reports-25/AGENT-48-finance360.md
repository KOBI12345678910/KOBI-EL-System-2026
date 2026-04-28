# AGENT-48 — Finance360 Page Audit

**Date:** 2026-04-29
**Scope:** Audit Finance360 page — overview of GL / AR / AP / Cash
**Verdict:** PARTIAL — Two divergent implementations exist; neither covers the full GL/AR/AP/Cash mandate per `wiring-spec.js`.

---

## 1. Files Discovered

| Path | Type | Purpose |
|------|------|---------|
| `onyx-procurement/src/features/finance/Finance360.tsx` | Aggregate "Control Room" | KPI tabs over all invoices/payments/exceptions |
| `techno-kol-ops/client/src/pages/360/Finance360.tsx` | Per-record 360 (by `:id`) | Single invoice document view via `get_finance_360_fast` RPC |
| `techno-kol-ops/client/src/features/finance/Finance360.tsx` | Duplicate of above | Same content, alternate import path — DRIFT |
| `_merge-staging-final/.../Finance360.tsx` (x3) | Stale merge copies | Should be excluded from build |

Conflict: `onyx-procurement` ships an aggregate view, `techno-kol-ops` ships a per-invoice view. Both are named `Finance360`. The wiring spec implies one canonical Finance360 with 12 tabs.

---

## 2. Required Sections (per `pipeline/wiring-spec.js` lines 142–147)

```
tabs:    invoices, payments, collections, bank_matching, vat,
         tax, cashflow, budget, gl, costing, exports, audit_log
widgets: ar_summary_card, ap_summary_card, overdue_summary_card,
         cashflow_card, reconciliation_card, vat_liability_card
primary: issue_invoice, register_payment, reconcile_bank,
         export_tax, open_collection_case
secondary: send_collection_notice
```

---

## 3. Coverage Matrix

### Aggregate variant — `onyx-procurement/src/features/finance/Finance360.tsx`
Tabs implemented: `overview`, `overdue`, `reconciliation`, `exceptions` (4 of 12).

| Required Section | Status | Notes |
|------------------|--------|-------|
| invoices | PARTIAL | KPI counts only; no list/drill |
| payments | MISSING | No payments tab |
| collections | MISSING | Spec calls for `open_collection_case` |
| bank_matching | PRESENT | `reconciliation` tab covers unreconciled payments |
| vat | MISSING | No VAT panel — IL critical |
| tax | MISSING | No annual tax export |
| cashflow | MISSING | No cash position / forecast |
| budget | MISSING | No budget vs actual |
| gl | MISSING | No GL journal browser |
| costing | MISSING | No project/cost-center costing |
| exports | MISSING | No export panel |
| audit_log | MISSING | Not rendered |
| **AR summary card** | PARTIAL | `total_outstanding`, `total_overdue` exist |
| **AP summary card** | MISSING | No AP summary (supplier invoices) |
| **Overdue summary card** | PRESENT | KPI + count |
| **Cashflow card** | MISSING |  |
| **Reconciliation card** | PRESENT | tab exists |
| **VAT liability card** | MISSING |  |

Primary actions present: 0 of 5. The aggregate view is read-only — no `issue_invoice`, `register_payment`, `reconcile_bank`, `export_tax`, `open_collection_case` buttons.

### Per-record variant — `techno-kol-ops/client/src/pages/360/Finance360.tsx`
This is a single-invoice page. Sections: header+state, KPIs (grand_total / balance_due / due_date / payment count), line_items table, payments table, documents table, audit log. Useful as `Invoice360`, but does not match the Finance360 mandate.

---

## 4. API Wiring

| Page | Endpoint | Status |
|------|----------|--------|
| Aggregate | `GET /api/finance/control-room` | Exists in code; return shape only covers summary + overdue + unreconciled + exceptions |
| Per-record | Supabase RPC `get_finance_360_fast(p_invoice_id)` | Defined in `supabase/migrations/00002_secure_rpc_functions.sql` |

No endpoints found for: `/api/finance/gl`, `/api/finance/ap-summary`, `/api/finance/cashflow`, `/api/finance/budget`, `/api/finance/costing`, `/api/finance/exports`. VAT exists at `/api/vat/*` but is not wired into Finance360.

Adjacent richer pages exist standalone but are not surfaced as Finance360 tabs:
`erp-app/src/pages/finance/{payables-dashboard,payment-operations,revenue-tracking,project-profitability,management-reporting,expense-breakdown,finance-alerts,fin-control-center,masav-management,supplier-cost-analysis,profitability-feedback-loop,payment-terms}.tsx`.

---

## 5. No-Dead-Pages Test (per CLAUDE.md)

Aggregate Finance360:
- Where am I? YES (header)
- What is this? YES (subtitle)
- Current status? PARTIAL (KPIs but no period/as-of)
- What can I do? FAIL — zero action buttons
- Next step? FAIL — no recommended action
- Related records? PARTIAL — overdue list, unreconciled list

Per-record Finance360: passes header/state/related-records but lacks primary actions (no `register_payment` / `send_reminder`).

---

## 6. Gaps vs Master Flow

The Master Flow ends at `Invoice → Payment → Closure`. Finance360 should be the operational hub at this stage, but:
1. **No AP side** — `supplier_invoice`, `payment_run`, `masav_export` not represented in spec or page.
2. **No GL** — `gl_transaction` ontology entity exists (`pipeline/ontology.js:54`) but no GL tab.
3. **No cashflow forecast** — `ai.update_cashflow_forecast` listener exists in `orchestrator.js:187` but no consumer UI.
4. **VAT disconnected** — `vat_record` entity exists, dedicated `vat-dashboard.jsx`, but not embedded in Finance360.
5. **Costing isolation** — orchestrator emits `post_costs_to_finance` (`state-machines.js:241`) but no costing tab consumes it.

---

## 7. Naming / Routing Conflict

Two components named `Finance360` rendered by different services creates ambiguity. The pattern used elsewhere (`Customer360`, `Project360`) is per-record. Recommend:
- Rename aggregate to **`FinanceControlRoom`** (matches `ontology.js:219` `'Finance Control Room'` label).
- Keep per-record as **`Invoice360`** (rendered for `/invoices/:id`).
- Build a true `Finance360` with the 12 spec tabs as the finance landing page.

---

## 8. Recommendations (prioritized)

| Priority | Action |
|----------|--------|
| P0 | Resolve naming: aggregate → `FinanceControlRoom`; per-record → `Invoice360`; create new `Finance360` matching wiring spec |
| P0 | Add 8 missing tabs: `payments`, `collections`, `vat`, `tax`, `cashflow`, `budget`, `gl`, `audit_log` |
| P0 | Add 3 missing widgets: `ap_summary_card`, `cashflow_card`, `vat_liability_card` |
| P0 | Wire 5 primary action buttons calling `/api/orchestrator/execute` with the right action ids |
| P1 | Backend: implement `/api/finance/{gl,ap-summary,cashflow,budget,costing,exports}` |
| P1 | Embed existing `erp-app/finance/*` pages as iframe/component tabs to avoid rebuild |
| P1 | Fix `bank_match_status` literal `'unmatched'` color mapping (currently green via fallback) — verify in `badgeClass` |
| P2 | Remove `_merge-staging-final/**/Finance360.tsx` to eliminate drift |
| P2 | Add "Next Recommended Action" banner per CLAUDE.md no-dead-pages rule |

---

## 9. Key Findings Summary

- Spec mandates 12 tabs, 6 widgets, 5 primary actions. Implementation delivers 4 tabs, 2 widgets, 0 primary actions = ~22% coverage.
- Two `Finance360` components with incompatible scopes coexist — naming collision.
- AP, GL, Cashflow, Budget, VAT, Tax, Costing dimensions absent from page despite ontology and adjacent ERP pages existing.
- IL compliance risk: VAT liability and tax export are spec-required but unrendered.
