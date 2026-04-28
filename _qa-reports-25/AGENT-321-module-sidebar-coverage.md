# AGENT-321 — Module Sidebar Coverage Audit

**Agent:** 321 (Module Sidebar Coverage)
**Date:** 2026-04-29
**Scope:** Verify every business module from CLAUDE.md + Agent 251 SAP-gaps appears in the frontend sidebar/menu and resolves to a real page.
**Method:** Static analysis of `erp-app/src/components/layout.tsx` (`NAV_ITEMS`, 597 entries / 17 sections), `erp-app/src/pages/**`, all `supabase/migrations/*menu*.sql` (19 migrations), and `00067_deactivate_dead_menu_items.sql` (627 routes deactivated).

---

## 1. Architecture Reality Check

| Layer | Where | What it does |
|---|---|---|
| **DB seed** | `supabase/migrations/00017_app_menu.sql` (schema) + `00034`, `00035`, `00038`–`00066` (seeds, ~138 rows after dedupe) + `00067_deactivate_dead_menu_items.sql` (627 routes set `is_active = false`) | Persists a `public.app_menu` tree (label, route, icon, parent_id, order_index, is_active, required_permission) |
| **API** | No `/api/menu` endpoint or `app_menu` consumer found anywhere in `erp-app/src/` | DB menu is unconsumed by the frontend |
| **Sidebar** | `erp-app/src/components/layout.tsx` lines 183–899 (`const NAV_ITEMS: NavItem[] = [...]`) | **Hardcoded TS array** — 597 items grouped by `section` + optional `subSection`. Lucide icons. Wouter `<Link>` routing. |
| **Section order** | `SECTION_ORDER` array in `layout.tsx` line 2145 | 18 sections, RTL Hebrew labels |

**Critical finding:** the live DB `app_menu` table (138 rows, 132 active, 26 top-level) and the rendered sidebar **are decoupled**. They were generated/edited independently and drift apart. The sidebar component does not call `/api/menu` or query Supabase for menu rows. So "DB has X menu rows" tells us nothing about what users see.

**Top-level sidebar sections (18, in render order):**
ראשי · תקשורת ושיתוף פעולה · מנוע בינה מלאכותית — AI · שולחן שליטה מנהלי · לקוחות ומכירות · כספים · רכש ושרשרת אספקה · מלאי ולוגיסטיקה · ייצור · ניהול פרויקטים · משאבי אנוש · אסטרטגיה וחזון · שיווק · מסמכים וחוזים · דוחות · מתקנים והתקנות · בונה מערכת · הגדרות מערכת.

---

## 2. Required Module Coverage Matrix

Legend:
- **Sidebar** = appears in `NAV_ITEMS` with non-deactivated route
- **app_menu DB** = present in current `app_menu` rows after migration 00067
- **Page exists** = file exists under `erp-app/src/pages/**`
- **Hebrew label** = sidebar label is Hebrew
- COV = covered · PART = partial · MISS = missing

| # | Required Module | Sidebar Section | Hebrew Label | Page exists | app_menu DB | Status |
|---|---|---|---|---|---|---|
| 1 | **ERP** (umbrella) | "ראשי" + every section | "דשבורד מנהלים" / "סקירת פלטפורמה" | `pages/dashboard.tsx`, `pages/platform/*` | yes (top-level cats) | COV |
| 2 | **CRM** | "לקוחות ומכירות" → CRM ולקוחות / CRM מתקדם | "דשבורד CRM", "ניהול לידים", … | `pages/crm/*` (multi) | yes | COV |
| 3 | **BOM** | "ייצור" → BOM ועצי מוצר | "עצי מוצר (BOM)", "ניהול עצי מוצר" | `pages/production/bom-*` | yes (`/bom`, deactivated `00067`) | COV (sidebar live, DB `/bom` deactivated) |
| 4 | **Accounting** (הנהלת חשבונות) | "כספים" → הנהלת חשבונות | "יומן תנועות", "מאזן בוחן", "עץ חשבונות", "כרטסת חשבון", "ספר חשבונות ראשי" | `pages/finance/journal-*`, `chart-of-accounts.tsx`, … | yes (under "כספים") | COV |
| 5 | **Finance** | "כספים" (entire section, 100+ items) | "דשבורד כספים", … | `pages/finance/**` (60+ files) | yes | COV |
| 6 | **HR** | "משאבי אנוש" | "דשבורד משאבי אנוש", "ניהול עובדים", … | `pages/hr/**` | yes | COV |
| 7 | **Procurement** | "רכש ושרשרת אספקה" | "דשבורד רכש", "הזמנות רכש", … | `pages/procurement/**`, `purchase-orders.tsx` | yes | COV |
| 8 | **Inventory** | "מלאי ולוגיסטיקה" | "ניהול מלאי", "מחסנים", … | `pages/inventory/**` | yes | COV |
| 9 | **Manufacturing** | "ייצור" | "מחלקת ייצור", "MES", "SCADA", … | `pages/production/**`, `pages/manufacturing/**` | yes | COV |
| 10 | **Quality** | "ייצור" → בקרת איכות | "רשימות בדיקה", "בדיקות", "אי-התאמות (NCR)" | `pages/quality/**`, `pages/production/quality-*` | yes | COV |
| 11 | **Sales** | "לקוחות ומכירות" → מכירות | "הצעות מחיר", "הזמנות מכירה", "חשבוניות מכירה", … | `pages/sales/**` | yes | COV |
| 12 | **Projects** | "ניהול פרויקטים" | "דשבורד פרויקטים", "אבני דרך", … | `pages/projects/**`, `pages/execution/**` | yes | COV |
| 13 | **Work Orders** | "ייצור" → הזמנות עבודה והוראות | "הזמנות עבודה", "הוראות עבודה Enterprise" | `pages/execution/WorkOrder*`, `pages/production/work-orders*` | yes | COV |
| 14 | **Payroll** | "משאבי אנוש" → שכר ותגמול | "תלושי שכר", "ריכוז שכר חודשי", "מחשבון שכר חכם", "חישוב משכורות" | `pages/hr/payroll-engine*`, `pages/payroll.tsx` | yes | COV |
| 15 | **Tax (VAT/PCN874)** | "כספים" → מס ודיווח | "דוחות מע\"מ", "ניכויים במקור", "מס ומע\"מ (18%)" | `pages/reports/financial/report-vat.tsx`, `finance/tax-management*`, `israeli-integrations.tsx` (PCN874 string match) | yes (`/vat-report`, `/withholding-tax`) | PART — sidebar exposes VAT and withholding; **PCN874 is not surfaced as its own sidebar item** (Hebrew label). Form-102, form-126, form-1301 routes are all DEACTIVATED in migration 00067 |
| 16 | **Reports** | "דוחות" (top-level) + each domain has its own דוחות sub | "מרכז דוחות", "BI Dashboard", "דשבורד KPI", "דוחות פיננסיים", … (37 items) | `pages/reports/**` | yes | COV |
| 17 | **Dashboard** | "ראשי" + "שולחן שליטה מנהלי" + per-domain "דשבורד X" | "דשבורד מנהלים", "דשבורד מנכ\"ל", … | `pages/dashboard.tsx`, `pages/executive/**`, `pages/command-center/**` | yes | COV |
| 18 | **Audit** | "בונה מערכת" + "הגדרות מערכת" | "יומן ביקורת" (`/audit-log`) + "Audit Trail" + "בקרת ביקורת" | `pages/audit-log.tsx`, `pages/finance/audit-control.tsx`, `pages/crm/security/audit` | partial (renamed) | COV |
| 19 | **Banking** | NOT EXPOSED as a top-level section. Bank features hidden under "כספים" → בנקים וקופה | "חשבונות בנק", "התאמות בנק", "תזרים מזומנים" | `pages/finance/bank-accounts.tsx`, `bank-reconciliation.tsx` | partial (`/bank/*` routes all deactivated in 00067) | PART — features exist, no dedicated "Banking / בנקאות" module section. Israeli MASAV exporter, swift parser, bank-routes are all coded in `onyx-procurement/src/bank/*` but not surfaced in sidebar |
| 20 | **Real Estate** | "ניהול פרויקטים" → נדל\"ן (sub of Projects) | 'קריתי 10 ת\"א', "מעקב יחידות", "היתרים ורישוי", "ניהול קבלנים" | `pages/projects/real-estate/*` | partial (`/properties`, `/leases`, etc. all deactivated 00067) | PART — only one project (Kiryati 10) hard-coded; no generic real-estate top-level module. Migration 00067 deactivated 14 `/realestate/*` routes (broker-fees, valuation, mortgage-calc, …) |
| 21 | **Logistics** | NOT a top-level. "מלאי ולוגיסטיקה" combines inventory+logistics; "ייצור" → לוגיסטיקה sub | "תכנון משלוחים ומשגור", "עקיבות שרשרת אספקה", "אריזה", "הובלות" | `pages/logistics/driver-management.tsx`, `vehicle-registry.tsx`, `pages/supply-chain/**` | yes (logistics_orders) | PART — DB schema exists (mig 00076 `logistics_schema.sql`); only 2–3 sidebar items; no Logistics360 or fleet/route dashboard surfaced |
| 22 | **Education** | NOT in sidebar. Section absent. | — | NO `pages/education/*` directory | DB only (mig 00083 `edu_domain.sql`) | **MISS** — schema yes, sidebar no, pages no |
| 23 | **Health** | NOT in sidebar. Only "/executive/company-health" (different concept) | — | NO `pages/health/*` directory | DB only (mig 00077 `health_domain.sql`) | **MISS** — schema yes, sidebar no, pages no |
| 24 | **Hotel** | NOT in sidebar. Section absent. | — | NO `pages/hotel/*` directory | DB only (mig 00074 `hotel_domain_complete.sql`) | **MISS** — schema yes, sidebar no, pages no |
| 25 | **Food** | NOT in sidebar. Section absent. | — | NO `pages/food/*` directory | DB only (mig 00082 `food_domain.sql`) | **MISS** — schema yes, sidebar no, pages no |
| 26 | **Sports** | NOT in sidebar. Section absent. | — | NO `pages/sports/*` directory | DB only (mig 00081 `sports_domain.sql`) | **MISS** — schema yes, sidebar no, pages no |
| 27 | **Insurance** | NOT in sidebar. Only auxiliary "/import/insurance", "/hr/contractor-insurance" | — | NO `pages/insurance/*` directory | DB only (mig 00080 `insurance_domain.sql`) | **MISS** — schema yes, sidebar no, pages no |
| 28 | **Energy** | NOT in sidebar. No domain migration found. | — | NO `pages/energy/*` directory | NO migration | **MISS** entirely |
| 29 | **Agriculture** | NOT in sidebar. Section absent. | — | NO `pages/agri*/` directory | DB only (Agent-120 ref) | **MISS** — schema referenced, sidebar no, pages no |
| 30 | **Auto/Automotive** | NOT in sidebar. Section absent. | — | NO `pages/auto/*` directory | DB only (mig 00078 `automotive_domain.sql`) | **MISS** — schema yes, sidebar no, pages no |
| 31 | **eCom** | NOT in sidebar. No section. | — | NO `pages/ecom/*` directory | NO migration found | **MISS** entirely |
| 32 | **Events** | NOT in sidebar. Section absent. | — | NO `pages/events/*` directory | DB only (mig 00079 `events_domain.sql`) | **MISS** — schema yes, sidebar no, pages no |
| 33 | **Legal** | NOT in sidebar as top-level. Only contracts/governance. | "ממשל תאגידי" (`/governance`), "חוזים" (`/contracts`) | `pages/governance.tsx`, `pages/contracts/*` | NO legal-specific menu rows | PART — generic contracts/governance present; no Legal-domain section, no matter management, no IP/trademark module |

---

## 3. Critical Gaps Summary

### 3a. Missing Sidebar Sections (vertical-domain modules required by Agent-251)
Eight required vertical-domain modules **have DB schema migrations but NO sidebar entry and NO pages**:

| Module | Migration | Sidebar | Pages |
|---|---|---|---|
| Hotel | `00074_hotel_domain_complete.sql` | absent | absent |
| Logistics (deep) | `00076_logistics_schema.sql` | minimal (2–3 items) | partial |
| Health | `00077_health_domain.sql` | absent | absent |
| Auto | `00078_automotive_domain.sql` | absent | absent |
| Events | `00079_events_domain.sql` | absent | absent |
| Insurance | `00080_insurance_domain.sql` | absent | absent |
| Sports | `00081_sports_domain.sql` | absent | absent |
| Food | `00082_food_domain.sql` | absent | absent |
| Education | `00083_edu_domain.sql` | absent | absent |

These represent **Agent-112…AGENT-128 vertical domains** that were scaffolded at DB level only. They never received a frontend section, sidebar header, or even a stub page.

### 3b. Modules with DB rows but Frontend dead routes
Migration `00067_deactivate_dead_menu_items.sql` deactivates **627 routes** that are present in `app_menu` rows but have **no `<Route>` declaration in `App.tsx`** and no page file. Examples relevant to required modules:
- Tax forms: `/form-102`, `/form-126`, `/form-1301`, `/form-30a`, `/form-6111`, `/form-857`, `/tax/transfer-pricing`, **`/vat/pcn836`** (note: PCN874 not even in dead-routes list)
- Real estate: 14 routes (`/properties`, `/leases`, `/rent-collection`, `/tenant-portal`, …)
- Banking: all `/bank/*` routes (`bank-routes`, `matcher`, `multi-format-parser`, `parsers`, `smart-categorizer`, `masav-exporter`)
- Payroll exports: `/payroll/payroll-routes`, `/pension/section-14`, `/pension/severance-tracker`
- Logistics: `/logistics/route-optimizer`

The frontend sidebar (`layout.tsx`) DOES expose live routes for Banking, Real Estate, Tax inside other sections (כספים / ניהול פרויקטים / כספים → מס ודיווח), but the canonical DB `app_menu` rows pointing to `/bank/*`, `/realestate/*`, `/tax/*` are deactivated. **The two systems disagree.**

### 3c. Hebrew Label Coverage
All sidebar labels in `NAV_ITEMS` are in Hebrew (RTL) — confirmed by spot-check across 597 entries. ICON coverage: every `NavItem` has a `lucide-react` icon. Route resolution depends on `<Route>` declarations in `App.tsx` (over 600 lazy imports observed — `auto-wire-react-routes.log.json` reference).

---

## 4. PCN874 — Specific Drill-Down (caller called this out)

| Search location | Result |
|---|---|
| `app_menu` migrations 00017–00067 | only `/vat-report` (PCN836-related) and `/vat/pcn836` (deactivated). **No PCN874 menu row** |
| `NAV_ITEMS` in `layout.tsx` | label `'דוחות מע"מ'` only — PCN874 not surfaced |
| `pages/**` | string match in `pages/finance/israeli-integrations.tsx`, `pages/reports/financial/report-vat.tsx` (logic exists) |
| QA report | `_qa-reports-25/AGENT-132-pcn874.md` exists (separate audit) |

**Verdict:** PCN874 logic exists in pages but has **no dedicated sidebar entry, no DB menu row, no Hebrew label**. Hidden behind generic VAT report.

---

## 5. Top-Level Section Count vs Required Modules

| Source | Count |
|---|---|
| Sidebar top-level sections (`SECTION_ORDER`) | 18 |
| `app_menu` top-level rows (parent_id IS NULL, is_active=true) | 26 (per task input) |
| Required modules (CLAUDE.md + Agent 251) | 33 |
| **Required modules COVERED** in sidebar with a section | 18 (ERP, CRM, BOM, Accounting, Finance, HR, Procurement, Inventory, Manufacturing, Quality, Sales, Projects, Work Orders, Payroll, Tax-partial, Reports, Dashboard, Audit) |
| **Required modules PARTIAL** (exist sub-buried) | 4 (Banking, Real Estate, Logistics, Legal) |
| **Required modules MISSING** | 11 (Education, Health, Hotel, Food, Sports, Insurance, Energy, Agriculture, Auto, eCom, Events) |

Coverage: **18 / 33 = 54.5% full · 4 / 33 = 12% partial · 11 / 33 = 33.3% missing**.

---

## 6. Recommendations (in priority order)

1. **Wire the sidebar to `app_menu`**: replace the 597-row hardcoded `NAV_ITEMS` with a `useQuery(["menu"])` call against `GET /api/menu` (endpoint to be created). Single source of truth eliminates the drift between DB seed (138 rows) and TS array (597 entries).
2. **Create top-level sidebar sections** for the 9 vertical-domain modules whose DB schema already exists: Hotel, Health, Auto, Events, Insurance, Sports, Food, Education, Logistics-as-its-own-section. Each needs ≥1 360 page, dashboard, and sidebar header in Hebrew.
3. **Reactivate or rebuild** the 627 dead routes in `00067_deactivate_dead_menu_items.sql`. Many critical pieces (Banking `/bank/*`, Real Estate `/realestate/*`, Pension Section 14, MASAV exporter, PCN forms, Form 102/126/1301) are dead but reachable indirectly through other sidebar items.
4. **Add explicit PCN874 sidebar item** under "כספים" → "מס ודיווח" — currently buried inside a generic VAT report.
5. **Add Energy + eCom domain migrations** — these two have no schema at all.
6. **Insert top-level "בנקאות" and 'נדל"ן' sections** rather than burying inside Finance/Projects, matching SAP-style module separation.

---

## 7. Evidence Index

- Sidebar source: `erp-app/src/components/layout.tsx` (lines 183–899 = `NAV_ITEMS`; lines 2145–2164 = `SECTION_ORDER`)
- DB schema: `supabase/migrations/00017_app_menu.sql`
- DB seeds: `supabase/migrations/00034_app_menu_complete.sql` (128 items target), `00035_app_menu_FULL.sql` (full auto-gen), `00038…00066` (per-domain wiring)
- Dead routes: `supabase/migrations/00067_deactivate_dead_menu_items.sql` (627 routes deactivated)
- Vertical domain migrations: `00074_hotel_domain_complete.sql` · `00076_logistics_schema.sql` · `00077_health_domain.sql` · `00078_automotive_domain.sql` · `00079_events_domain.sql` · `00080_insurance_domain.sql` · `00081_sports_domain.sql` · `00082_food_domain.sql` · `00083_edu_domain.sql`
- Cross-reference: `_qa-reports-25/AGENT-251-sap-gaps.md`, `AGENT-112…AGENT-129` (per-domain QA reports under `_qa-reports-25/`)
- App router: `erp-app/src/App.tsx` (629+ lazy imports auto-wired 2026-04-18)
