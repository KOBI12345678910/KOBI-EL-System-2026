# AGENT-FIX-RTL — Applied

Date: 2026-04-29 | Scope: top RTL + locale offenders. Skipped `_merge-incoming/`, `node_modules/`, `AI-Task-Manager/`.

## Part A — RTL `text-align` / Tailwind classes (logical properties)

| # | File | Edits |
|---|------|-------|
| 1 | `payroll-autonomous/src/components/BankReconciliation.tsx` | 2x `textAlign: 'left' as const` -> `'start' as const` (lines 358, 403). `'center'` left as-is. |
| 2 | `onyx-procurement/src/features/suppliers/Supplier360.tsx` | `text-left` -> `text-start` (L292); `text-right` -> `text-end` (L318). |
| 3 | `erp-app/src/pages/crm/territory-management.tsx` | All `<th>` `text-right` -> `text-end` (8 cells); `<td>` `text-left` -> `text-start` (2 cells). |
| 4 | `erp-app/src/pages/crm/contract-management.tsx` | `<div text-left>` -> `text-start` (alert pane, L227); `<th>` `text-right` -> `text-end` (5 headers). |
| 5 | `techno-kol-ops/client/src/pages/Project360.tsx` | `textAlign: 'right'` -> `'end'` (sortable `<th>`, L182); `'left'` -> `'start'` (3 instances: budget label L444, phase pct L646, audit user block L959). |
| 6 | `techno-kol-ops/client/src/pages/WorkOrder360.tsx` | `textAlign: 'right'` -> `'end'` (sortable `<th>`, L198); `'left'` -> `'start'` (audit user block L936). |
| 7 | `techno-kol-ops/client/src/pages/Pipeline.tsx` | `textAlign: 'left'` -> `'start'` (price column, L256). `'center'` left as-is. |
| 8 | `techno-kol-ops/client/src/pages/InvoicePrint.tsx` | `textAlign: 'left'` -> `'start'` (title block L160 + 3 totals cells L219/223/227); ternary `'right' : 'center'` -> `'end' : 'center'` (table head L195). |
| 9 | `techno-kol-ops/client/src/components/HoursReport.tsx` | `Th` and `Td` styled components: `'right'` -> `'end'`; `BarRow` label: `'left'` -> `'start'` (L759); 10 inline `<th>` `'right'` -> `'end'` (entries table). |
| 10 | `payroll-autonomous/src/components/InvoicePrintTemplate.tsx` | `styles.companyBlock`/`th`/`totalLabel` `'right'` -> `'end'`; `invoiceTitleBlock`/`totalValue` and 2 inline `<td>` `'left'` -> `'start'`. |

`textAlign: 'center'` instances were preserved (orientation-neutral).

## Part B — `.toLocaleDateString()` -> `.toLocaleDateString('he-IL')`

| # | File | Lines |
|---|------|-------|
| 1 | `erp-app/src/components/ui/calendar.tsx` | 193 |
| 2 | `erp-app/src/components/notification-bell.tsx` | 169 |
| 3 | `erp-app/src/components/leads/lead-card.tsx` | 135 |
| 4 | `erp-app/src/pages/supplier-mgmt/supplier-portal-dashboard.tsx` | 153 |
| 5 | `erp-app/src/pages/security/tabs/webhook-secrets.tsx` | 173, 174 |
| 6 | `erp-app/src/pages/security/tabs/vulnerability-tracker.tsx` | 233 |
| 7 | `erp-app/src/pages/security/tabs/api-keys-security.tsx` | 212, 215, 218 |

Total: 10 files / 13 RTL substitutions across ~35 sites; 7 files / 10 locale call-sites.
No commits made.
