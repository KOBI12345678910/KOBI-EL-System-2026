# AGENT-173 — Empty State Messages Audit

**Agent**: 173
**Date**: 2026-04-29
**Branch**: claude/objective-merkle-40ff93
**Scope**: Hebrew empty state messages across all four services + mobile-app
**Reference**: `_qa-reports/AG-X20-mobile-responsive.md` (mobile primitives — touches empty states implicitly via `MobileLayout` content slots)

---

## Executive summary

The codebase already ships **3 reusable EmptyState components** with helpful CTAs in Hebrew, but adoption is partial: **279 occurrences across 200 files** still emit a bare-string placeholder ("אין נתונים", "לא נמצאו"). The primitives are good; the gap is migration of legacy table/list cells to use them.

| Tier | Count | Verdict |
|------|------:|---------|
| Reusable component (`EmptyState` / `MobileEmptyState`) with icon + title + description + CTA | ~28 sites | GOOD |
| Themed inline empty (icon + Hebrew message, no CTA) | ~40 sites | OK |
| Bare placeholder string ("אין נתונים", "לא נמצאו") inside a `<TableCell>` or `<div>` | **~211 sites** | NEEDS WORK |

---

## Reusable primitives (already shipped — reuse these)

### 1. `erp-app/src/components/ui/unified-states.tsx` (lines 26-59)
TypeScript, Tailwind, framer-motion. Props: `icon`, `title`, `description`, `action {label, onClick, icon}`, `variant: default|search|file|offline`. Animated, RTL-friendly, ships with `Inbox`/`Search`/`FileX`/`WifiOff` defaults. **This is the canonical one.**

### 2. `erp-app/src/components/common/empty-state.tsx` (lines 1-30)
Simpler default-export variant. Props: `icon`, `title`, `description`, `actionLabel`, `onAction`. Indigo CTA, slate palette.

### 3. `mobile-app/components/MobileEmptyState.tsx` (lines 1-97)
React Native, Feather icons. Props: `icon`, `title`, `description`, `action {label, onPress}`. Used correctly in `mobile-app/app/hr/attendance.tsx`, `mobile-app/app/finance/payments.tsx`, `mobile-app/app/entity/[id].tsx`.

### 4. `payroll-autonomous/src/components/BIDashboard.jsx` (line 845)
Local `EmptyState({label})` — chart-only, no CTA. Acceptable for chart cards.

---

## Good examples (keep, replicate)

| File | Line | Why it's good |
|------|-----:|---------------|
| `erp-app/src/pages/builder/dynamic-data-view.tsx` | 830-833 | Differentiates filtered-empty vs first-time-empty; CTA "צור את הרשומה הראשונה כדי להתחיל" |
| `erp-app/src/pages/builder/builder-section.tsx` | 1056-1060 | Search-aware title `לא נמצאו תוצאות עבור "${q}"` vs `אין ${title} עדיין` |
| `erp-app/src/pages/ehs/waste-management.tsx` | 173-176 | Title + description guides user to "הוסף רשומה" CTA |
| `erp-app/src/pages/builder/template-builder.tsx` | 134 | `{search ? "לא נמצאו תבניות תואמות" : "אין תבניות תוכן. צור תבנית ראשונה."}` |
| `erp-app/src/pages/crm/segmentation-dashboard.tsx` | 169 | `אין נתונים<br /><span>לחץ על "חשב RFM" כדי לאתחל</span>` — explicit next step |
| `techno-kol-ops/client/src/pages/FinancialAutonomy.tsx` | 724 | `אין אנומליות פתוחות. לחץ על "סריקה יומית" כדי להריץ סריקת AI חדשה.` |
| `techno-kol-ops/client/src/pages/SituationDashboard.tsx` | 616 | `לא נמצאו בעיות חריגות 🎉` — positive framing |
| `payroll-autonomous/src/components/AuditTrail.jsx` | 74 | Empty hint reflects current filter: `לא נמצאו רישומים התואמים את הסינון הנוכחי` |

---

## Bad pattern: bare placeholder, no CTA, no icon, no next step

These violate the "No Dead Pages Rule" from CLAUDE.md ("Next step? Related records?").

### Top offenders by frequency

| Phrase | Sites |
|--------|------:|
| `אין נתונים` (bare, no context) | ~85 |
| `אין רשומות` | ~24 |
| `לא נמצאו תוצאות` | ~14 |
| `לא נמצאו <noun>` (לידים, ספקים, חשבוניות וכו׳) | ~88 |

### Representative offenders

| File | Line | Current text | Why it fails |
|------|-----:|--------------|--------------|
| `erp-app/src/pages/customer-service.tsx` | 641, 701 | `אין נתונים` | No icon, no CTA, no hint why list is empty |
| `erp-app/src/pages/comms/_CommsTable.tsx` | 90 | `אין נתונים` | Generic — does not say what's missing |
| `techno-kol-ops/client/src/pages/360/Customer360.tsx` | 126, 190 | `אין רשומות` | On a 360 page — should suggest `הוסף קשר`/`צור הזמנה` |
| `techno-kol-ops/client/src/pages/360/Supplier360.tsx` | 47 | `אין רשומות` | Same — 360 page must offer next action |
| `techno-kol-ops/client/src/pages/360/shared360.tsx` | 90, 128 | `אין רשומות` | Shared component reused across all 360 pages — fixing this fixes 9 P0 pages |
| `techno-kol-ops/client/src/pages/HRAutonomy.tsx` | 524, 1097 | `לא נמצאו עובדים`, `אין רשומות משמעת` | Should CTA `הוסף עובד`, `הוסף הערה` |
| `techno-kol-ops/client/src/pages/ProcurementHyperintelligence.tsx` | 652, 690, 2506 | `אין נתונים`, `אין נתונים להצגה` | Multiple charts — bare placeholder |
| `techno-kol-ops/client/src/pages/HoursAttendance.tsx` | 1687, 1850 | `אין נתונים בתקופה הזו`, `אין נתונים להציג` | Date-range aware but no "שנה טווח" CTA |
| `techno-kol-ops/client/src/features/controlRooms/{Operations,Workforce,Procurement}ControlRoom.tsx` | 170/153/141 | `אין נתונים` | Three control rooms identical bare string |
| `payroll-autonomous/src/App.jsx` | 756 | `לא נמצאו נתונים` | Top-level shell — needs CTA |
| `erp-app/src/pages/inventory/wms-lot-traceability.tsx` | 318 | `לא נמצאו אירועים עבור לוט זה` | Could CTA `קלוט לוט חדש` / `סרוק ברקוד` |
| `erp-app/src/pages/crm/contract-intelligence.tsx` | 263 | `ספריית הסעיפים ריקה - הוסף נוסחים סטנדרטיים` | Hint exists but no actual button |
| `erp-app/src/pages/crm/{leads-management,leads-ultimate,agent-control-tower,contract-management,territory-management,campaign-analytics,commission-management,call-analysis,advanced-search,crm-automations,crm-communications-hub,email-sync}.tsx` | various | `לא נמצאו <X>` | 12 CRM pages — same anti-pattern |

---

## Required CTAs by entity (per `wiring-spec.js` 360 pages)

| Entity | When list is empty, CTA should be | Suggested copy |
|--------|-----------------------------------|----------------|
| Customer360 — orders/quotes | `צור הצעת מחיר חדשה` | "אין הצעות מחיר ללקוח זה — התחל בהצעה ראשונה" |
| Supplier360 — POs | `צור הזמנת רכש` | "אין הזמנות פתוחות לספק — צור PO" |
| Quote360 — line items | `הוסף פריט` | "ההצעה ריקה — הוסף את הפריט הראשון" |
| RFQ360 — bids | `שלח לספקים` | "טרם התקבלו הצעות — שלח RFQ לספקים" |
| Project360 — work orders | `צור הוראת עבודה` | "אין הוראות עבודה — צור WO ראשון" |
| WorkOrder360 — attendance/log | already correct (`techno-kol-ops/client/src/pages/WorkOrder360.tsx:710,925`) | use existing pattern |
| PO360 — receipts | `קלוט סחורה` | "טרם התקבלה סחורה — בצע GRN" |
| Finance360 — invoices/payments | `צור חשבונית` / `רשום תשלום` | "אין תנועות פיננסיות — צור חשבונית" |
| Employee360 — time/payslips | `החתם נוכחות` / `הפק תלוש` | "אין רישומי נוכחות החודש — דווח שעות" |

---

## Mobile responsiveness intersection (per AG-X20)

`MobileLayout.jsx` does not provide a built-in empty-state slot. When the empty state lives inside `<MobileLayout>` content, current bare placeholders display poorly on mobile (no centering, no safe-area handling). Fix: wrap with `<MobileEmptyState>` inside the content slot — already done correctly in 3 files; should be the standard for the remaining ~30 mobile-touched pages.

---

## Recommended fixes (priority order)

1. **P0 — Fix `shared360.tsx`** (`techno-kol-ops/client/src/pages/360/shared360.tsx:90,128` + `features/shared/shared360.tsx:90,128`). Single component used by all 9 Master 360 pages. Replace `<p>אין רשומות</p>` with `<EmptyState>` accepting per-section title + CTA via props.
2. **P0 — Fix control rooms** (`OperationsControlRoom`, `WorkforceControlRoom`, `ProcurementControlRoom`). Three identical bare strings — extract to a `<ControlRoomEmpty refreshLabel="רענן" />` helper.
3. **P0 — CRM bulk fix**. 12 CRM pages use the same `<tr><td colSpan>לא נמצאו X</td></tr>` pattern. Codemod to `<EmptyState variant="search" title=... action={{label: 'הוסף ' + entity, onClick: openCreate}} />`.
4. **P1 — Charts in BI/Procurement Hyperintelligence**. Wrap with `<EmptyState>` accepting a "שנה טווח" / "סנכרן נתונים" CTA.
5. **P1 — Consolidate primitives**. There are now 3 EmptyState implementations across the repo (`unified-states.tsx`, `common/empty-state.tsx`, plus a third in `builder-dashboard.tsx:445`). Move to a single `packages/shared-ui/EmptyState` and re-export.
6. **P2 — Lint rule**. Add an ESLint rule banning the literals `"אין נתונים"` and `"לא נמצאו"` outside the `EmptyState`/`MobileEmptyState` components — forces all new code through the helpful-CTA path.

---

## Audit score

- **Pages with helpful CTA empty state**: ~28 / ~239 (12%)
- **Pages with themed empty (icon, no CTA)**: ~40 (17%)
- **Pages with bare placeholder**: ~171 (71%)
- **Hebrew compliance**: 100% (no English "No data" leaked into UI strings)
- **RTL compliance**: 100% (all empty strings render in RTL containers)
- **Compliance with CLAUDE.md "No Dead Pages Rule"**: **FAIL** — bare placeholders do not answer "Next step?".

**Overall**: PARTIAL. Primitives exist and are correct; ~70% of pages still need migration. No new infrastructure required — codemod over existing components.

---

## Files of interest (absolute paths)

- Reference: `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\_qa-reports\AG-X20-mobile-responsive.md`
- Primitives:
  - `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\erp-app\src\components\ui\unified-states.tsx`
  - `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\erp-app\src\components\common\empty-state.tsx`
  - `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\mobile-app\components\MobileEmptyState.tsx`
- Highest-leverage fix target (touches 9 P0 pages):
  - `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\techno-kol-ops\client\src\pages\360\shared360.tsx`
  - `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\techno-kol-ops\client\src\features\shared\shared360.tsx`
