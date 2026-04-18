# 🏛️ Techno-Kol Uzi ERP 2026 — מפת המערכת המלאה (360°)

> מסמך זה נוצר ב-2026-04-18 ע"י סריקה מלאה של כל הקוד.
> זו התמונה האמיתית של המערכת כמו שהיא.

---

## 📊 סיכום ברמת גבוה

| מדד | כמות |
|-----|------|
| שירותים (services) | **5** |
| ישויות עסקיות (entities) | **29** |
| 360 Master Pages | **9** |
| מודולים / קטגוריות | **80+** |
| API endpoints | **180+** |
| Shared packages | **8** |
| Engines עצמאיים | **4** (nexus, paradigm, 2× palantir) |
| Edge Functions (Supabase) | **46** |
| DB Migrations | **34** |
| State Machines | **13** |
| Workflow Flows | **5** |
| Orchestrator Actions | **18** |
| Scheduled Jobs | **5** |
| QA Agent Files | **95+** |
| שפות נתמכות | **4** (he/en/ar/ru) |

---

## 1️⃣ חמשת השירותים (The 5 Services)

```
┌─────────────────────────────────────────────────────────────────┐
│                     TECHNO-KOL UZI ERP 2026                     │
└─────────────────────────────────────────────────────────────────┘

  [3200] techno-kol-ops         ← Operational Core (hub)
  [3100] onyx-procurement       ← Finance & Procurement backbone
  [3300] onyx-ai                ← Intelligence & Automation
  [5173] payroll-autonomous     ← Workforce & Salary engine
  [3400] vm-task-runner         ← Scheduled jobs (NEW)

  [5432] postgres / [6379] redis / [80] nginx
```

---

## 2️⃣ Master Flow — 13 שלבי הצינור

```
Lead → Quote → Approval → Order → Project → Work Orders →
Procurement → Inventory → Execution → Delivery → Invoice →
Payment → Closure
```

5 תת-זרימות עסקיות (`workflow-flows.js`):
1. **sales_to_project** — ליד → הצעה → פרויקט
2. **project_to_procurement** — פרויקט → RFQ → PO
3. **procurement_to_execution** — PO → מלאי → work order
4. **execution_to_cash** — משלוח → חשבונית → תשלום → סגירה
5. **employee_to_payroll** — נוכחות → חישוב → תלוש → העברה

---

## 3️⃣ ישויות עסקיות (29 entities)

### קבוצת מכירות / לקוחות
| ישות | סטטוסים | מקור |
|------|---------|------|
| **lead** (ליד) | new, contacted, qualified, quoted, won, lost | shared-types |
| **customer** (לקוח) | prospect, active, vip, inactive, blocked | shared-types |
| **quote** (הצעת מחיר) | draft, sent, under_review, approved, rejected, converted | shared-types |
| **contract** (חוזה) | draft, pending_signature, active, expired, terminated | entity-map |

### קבוצת רכש / ספקים
| ישות | סטטוסים |
|------|---------|
| **supplier** (ספק) | active, preferred, probation, blocked, inactive |
| **rfq** (בקשת הצעה) | draft, sent, quotes_received, under_comparison, approved, rejected, converted_to_po |
| **supplier_quote** | — |
| **po** (הזמנת רכש) | draft, pending_approval, approved, sent, partially_received, fully_received, closed |

### קבוצת פרויקטים / ייצור
| ישות | סטטוסים |
|------|---------|
| **project** (פרויקט) | draft, approved, in_planning, in_procurement, in_production, in_delivery, completed, closed |
| **work_order** | open, assigned, in_progress, waiting_materials, qa_check, done, signed_off |
| **task** | todo, in_progress, blocked, escalated, done, cancelled |

### קבוצת מלאי
| ישות | תיאור |
|------|-------|
| **material / inventory** | פריטי מלאי עם SKU, ספק, מיקום |
| **warehouse** | מחסנים |
| **material_movements** | receive / consume / adjust / return |

### קבוצת פיננסים
| ישות | סטטוסים |
|------|---------|
| **invoice** (חשבונית) | draft, issued, partially_paid, paid, overdue, in_collection, cancelled |
| **payment** (תשלום) | draft, posted, reconciled, reversed |
| **supplier_invoice** | — |
| **expense** (הוצאה) | — |

### קבוצת משאבי אנוש
| ישות | סטטוסים |
|------|---------|
| **employee** (עובד) | active, on_leave, suspended, terminated |
| **attendance** (נוכחות) | draft, submitted, approved, rejected, exported_to_payroll |
| **payroll / wage_slip** (תלוש) | draft, calculated, approved, exported, paid, cancelled |
| **pension_record** (פנסיה) | — |

### קבוצת מסמכים / סיכונים
| ישות | סטטוסים |
|------|---------|
| **document** | uploaded, classified, signed, archived |
| **alert** (התראה) | new, acknowledged, assigned, resolved, dismissed |
| **approval** (אישור) | — |
| **return** (החזרה) | — |
| **warranty_case** (אחריות) | — |

### קבוצת רגולציה ישראלית
- **vat_record** — רישום מע"מ
- **tax_record** — דיווח מס הכנסה
- **bank_match** — התאמת בנק
- **gl_transaction** — יומן ראשי

---

## 4️⃣ תשעת ה-Master 360 Pages (P0)

| # | דף | שירות עיקרי | קיים? |
|---|----|------------|------|
| 1 | **Customer360** | techno-kol-ops, onyx-procurement | ✅ |
| 2 | **Supplier360** | onyx-procurement | ✅ |
| 3 | **Quote360** | onyx-procurement | ✅ |
| 4 | **RFQ360** | onyx-procurement | ✅ (HTML) / 🚧 (TSX) |
| 5 | **Project360** | techno-kol-ops | ✅ |
| 6 | **WorkOrder360** | techno-kol-ops | ✅ |
| 7 | **PO360** | onyx-procurement | ✅ (HTML) / 🚧 (TSX) |
| 8 | **Finance360** | techno-kol-ops, onyx-procurement | ✅ |
| 9 | **Employee360** | techno-kol-ops, payroll-autonomous | ✅ (חלקי — חסר דף ייעודי ב-payroll) |

כל דף 360 חייב: header+status, primary actions, related records, documents, audit log, next recommended action.

---

## 5️⃣ מפת תפריטים (Navigation Map)

### A. techno-kol-ops — 15 Routes (Control Rooms + 360)

```
📊 Control Rooms
  ├── /executive       → Executive Control Tower
  ├── /operations      → Operations Control Room  (default landing)
  ├── /procurement     → Procurement Control Room
  ├── /workforce       → Workforce Control Room
  ├── /ai              → AI Control Room
  └── /command-center  → Command Center

🎯 360 Pages
  ├── /customer/:id    → Customer360
  ├── /supplier/:id    → Supplier360
  ├── /quote/:id       → Quote360
  ├── /rfq/:id         → RFQ360
  ├── /po/:id          → PO360
  ├── /project/:id     → Project360
  ├── /work-order/:id  → WorkOrder360
  ├── /employee/:id    → Employee360
  └── /finance         → Finance360
```

### B. payroll-autonomous — 8 קבוצות תפריט (RTL עברית)

```
💰 שכר
  dashboard · wage-slips · compute · employees · employers · clock-in · expenses

🛒 רכש ומכירות
  rfq · kanban · sales · bom

📈 ניתוח ומעקב
  bi · live · real-estate · gantt · audit · cashflow · exec-dashboard · targets

🚪 פורטלים
  supplier-portal · customer-portal · tenant-portal

🏢 Enterprise (22 פריטים)
  exec-tower · finance-control · command-center · kpi-engine · universal-inbox ·
  formula-builder · ai-agents · doc-intelligence · route-sync · mobile-exec ·
  crm-control · service-control · treasury-control · quality-control ·
  maintenance-control · planning-control · compliance-dash · pricing-engine ·
  widgets-board · inventory-alerts · doc-upload · contract-gen · qr-generator

🤖 עוזרי AI
  ai-kobi 👑 · ai-uzi 🔧

📄 דוחות
  reports · pnl

⚙️ מערכת
  tickets · notifications · help · admin
```

### C. onyx-procurement — Navigation דינמי
- נגזר מ-`CANONICAL_ROUTES` (19 קבוצות) + `PAGE_CONTRACTS`
- Dashboards HTML: onyx-dashboard, pipeline-dashboard, bank-dashboard, vat-dashboard, annual-tax-dashboard

### D. Mobile App — 11 מסכים
```
Login · Dashboard · Projects · WorkOrders · WorkOrderDetail ·
Materials · Employees · Finance · Alerts · AIAssistant · Profile
```

---

## 6️⃣ מודולים עסקיים (by category)

### 💼 מכירות / CRM
- **sales:** account-assignment, commission, competitor-tracker, lead-scoring, leaderboard, opportunity-stages, playbook-engine, quote-builder, sales-forecast, target-tracker, territory-manager, upsell, win-loss
- **crm:** pipeline
- **customer:** advocacy, churn-prevention, csat, health-score, journey-map, loyalty, meeting-scheduler, nps, onboarding, qbr-generator, referral, segmentation, success-plan, voc
- **portals:** customer-portal, supplier-portal, tenant-portal

### 🏭 פרויקטים / ייצור
- **manufacturing:** bom-manager, capacity-planning, drawing-vc, heat-treat-log, material-cert, oee-tracker, qc-checklist, routing-manager, scrap-tracker, tool-tracker, welder-certs, wo-scheduler
- **inventory:** optimizer, warehouse management
- **logistics:** route-optimizer, engineering/drawing-vc
- **quality / returns / warranty**
- **Pipeline של פרויקט** (techno-kol-ops) — **20 שלבים:**
  ```
  deal_closed → measurement_scheduled → measurement_done → contract_sent →
  contract_signed → materials_ordered → materials_arrived → production_assigned →
  production_started → production_progress → production_done → sent_to_paint →
  returned_from_paint → installation_scheduled → installation_started →
  installation_done → survey_sent → payment_requested → payment_received → project_closed
  ```

### 💰 כספים
- **finance:** aging-reports, bad-debt-provision, capital-projects, cashflow-forecast, check-register, credit-limits, debt-collection, deferred-revenue, fixed-assets, fx-hedging, ic-loans, signatory-workflow, treasury, wire-approval, wire-transfer, working-capital
- **gl:** journal-entry, financial-statements
- **bank:** bank-routes, matcher, multi-format-parser, parsers, reconciliation, smart-categorizer
- **payments:** check-printer, deposit-slip, payment-run, qr-payment
- **receipts · invoices · collections/dunning · cash/petty-cash · budget · expenses**

### 🧾 מיסוי ישראלי
- **tax:** annual-tax-routes, betterment-tax, capital-gains, dividend-withholding
- **טפסים:** Form-102, Form-126, Form-1301, Form-30A, Form-6111, Form-857
- **vat:** pcn836, vat-routes
- **purchase-tax, transfer-pricing, vat-refund, tax-exports**

### 🛒 רכש
- **rfq:** rfq-engine
- **po:** approval-matrix
- **approvals:** approval-engine

### 👥 משאבי אנוש
- **hr:** 360-feedback, analytics, ats, bonus-calc, cert-tracker, comp-planner, feedback-collection, grievance, handbook, interview-scheduling, offboarding, okr-tracker, onboarding, options-vesting, performance-review, skills-matrix, training-catalog
- **payroll:** payroll-routes, pdf-generator, wage-slip-calculator
- **pension, time-tracking**

### 🏗️ נדל"ן ובנייה
- **realestate:** arnona-tracker (ארנונה), broker-fees, building-permit (היתרי בנייה), inspection, lease-tracker, maintenance, mortgage-calc (משכנתא), portfolio-dashboard, property-manager, rent-collection, roi-calculator, tenant-portal, vacancy-tracker, valuation
- **construction:** progress-billing

### 📱 תקשורת
- **comms:** broadcast, bulletin-board, call-log, call-recording, email-templates, followup-engine, internal-chat, internal-wiki, life-events, meeting-notes, polls, reminders, sms-gateway, whatsapp-business, whatsapp
- **emails, sms, whatsapp, notifications (8 files), chatbot**

### 📑 מסמכים
- **documents:** clause-library, doc-diff, doc-search, doc-version-control, esign, expiry-alerts, legal-hold, metadata-manager, ocr-pipeline, pdf-form-filler, redaction, retention-policy, templates, watermark
- **ocr:** invoice-ocr, printing, scanners

### 🤖 AI / ML / ניתוחים
- **ai:** summarizer, ai-bridge
- **ml:** anomaly-detector, document-classifier
- **forecasting:** demand-forecaster
- **analytics, reporting (15 קבצים):** attribution, balance-sheet, benchmark, board-deck, budget-actual, cac-dashboard, cashflow-waterfall, cohort-analysis, executive-dashboard, funnel, kpi-scorecard, ltv-calculator, pnl-drilldown, revenue-waterfall, variance-analyzer
- **reports:** cash-flow-forecast, grand-aggregator, inventory-valuation, management-dashboard-pdf, pnl-report, quarterly-tax-report
- **search · kb · experiments**

### 🛡️ Compliance & Privacy
- **compliance:** aml-screener, conflict-of-interest, consumer-complaints, gift-register, legal-hold, pep-screener, retention-engine, sanctions-screener, whistleblower
- **privacy:** consent-mgmt, cookie-banner, dsr-handler, policy-generator, retention-enforcer, tos-tracker
- **auth, security, middleware, validators, flags**

### ⚙️ תשתיות
- **devops, ops, dr (disaster recovery), backup, resilience, realtime, queue, jobs, webhooks, integrations, imports, exports**
- **profiler, load, coverage, e2e, cli, config, seed**
- **wiring:** event-bus, domain-events, global-search, grand-consolidator, master-aggregator, tenant-config
- **workflow/engine · graphql · features · enterprise (multi-tenant) · consolidation · intercompany · costing · fx · pricing · bl · dedup · support**

---

## 7️⃣ מפת API endpoints (180+)

### techno-kol-ops (Port 3200) — ~85 endpoints

| קבוצה | endpoints |
|-------|-----------|
| Work Orders | GET /, GET /:id, POST /, PUT /:id, PUT /:id/progress, POST /:id/employees, PUT /:id/employees/:empId/hours |
| Employees | GET /, GET /:id, POST /, PUT /:id |
| Materials | GET /, GET /alerts, GET /:id, POST /, POST /:id/receive, POST /:id/consume |
| Clients | GET /, GET /:id, POST /, PUT /:id |
| Suppliers | GET /, POST / |
| Alerts | GET /, PUT /:id/resolve |
| Attendance | GET /today, GET /, POST / |
| Financials | GET /summary, GET /monthly, GET /by-category, GET /, POST / |
| GPS | POST /update, GET /current, GET /history/:employeeId |
| Tasks | GET /, POST /, PUT /:id/status, POST /:id/photo |
| Messages | GET /:employeeId, POST /, PUT /:id/read |
| Leads | GET /, POST /, PUT /:id |
| Reports | GET /weekly, GET /order/:id, GET /production |
| Pipeline | GET /, GET /:id, POST /, PUT /:id/advance, PUT /:id/reject, GET /approvals/mine, GET /client/:token, POST /client/:token/sign, POST /client/:token/survey |
| Intelligence | kpis, quote, anomalies, forecast/revenue, forecast/materials, roi/employees, scoring/clients, cashflow, optimize/schedule, quality/checklist, whatsapp/webhook |
| Supply Chain | dashboard, suppliers, eoq, bottlenecks, lead-time, stockout-risk, abc, carrying-cost, turnover, dead-stock |
| Ontology | object/:type/:id, search, digital-twin, schema |
| Brain | state, report/latest, decisions, learning, POST /run, briefing/morning, agenda, goals |
| AIP | POST /query, GET /suggestions |
| Signatures | documents CRUD, sign/:token, verify/:documentId |
| Notifications | GET, POST, POST /:id/read, POST /read-all |
| Admin | users CRUD, audit-log, stats |
| Bridges | /api/bridges/health, /api/bridges/procurement/purchase-orders, /api/bridges/ai/insights |

### onyx-procurement (Port 3100) — ~60 endpoints
- Suppliers, Purchase Requests, RFQ, Quotes, Purchase Orders, Subcontractors
- Events/Analytics (savings, spend-by-supplier, spend-by-category)
- Payroll (employers, employees, wage-slips compute/approve/issue/pdf/void)
- Bank (reconciliation), VAT (PCN836), Annual Tax
- Notifications · WhatsApp webhook · Audit

### onyx-ai (Port 3300) — ~15 endpoints
- /api/status · /api/events · /api/audit · /api/integrity
- /api/knowledge/query · /api/knowledge/entity
- /api/kill · /api/resume · /api/agent/:agentId/suspend
- /api/notifications/whatsapp · /api/notifications/email
- /api/notifications/payslip/:employeeId
- /api/notifications/work-order/:woId
- /api/notifications/invoice-reminder/:invoiceId

### payroll-autonomous — ללא backend (צורך מ-onyx-procurement:3100)

### vm-task-runner (Port 3400) — 3 endpoints
- GET /health · GET /jobs · POST /jobs/:name/trigger

---

## 8️⃣ Shared Packages (8)

| Package | תפקיד | דוגמאות exports |
|---------|-------|------------------|
| **shared-audit** | audit & state-history writers | AuditWriter, StateHistoryWriter, buildDiff |
| **shared-events** | Event bus (Supabase producer/consumer) | createEvent, EventProducer, TOPIC_MAP, 70+ event names |
| **shared-permissions** | RBAC + ownership | PermissionChecker, requireOwnerOrAdmin, 7 roles × 16 permission groups |
| **shared-types** | 29 entity types + enums + registry | ENTITY_TYPES, state enums, SERVICE_REGISTRY |
| **shared-ui** | Design system + 9 360-page contracts | STATE_BADGE_VARIANTS, PAGE_TABS, PAGE_LAYOUT |
| **shared-validation** | field + business validators | validateIsraeliId, validateVatNumber, validateIsraeliPhone, validateIBAN, ISRAELI_BANKS |
| **shared-workflows** | State machine engine + 12 pre-built machines | StateMachine, leadMachine, ... payrollMachine |
| **shared-observability** | logging/metrics/health/tracing | Logger, MetricsCollector, HealthChecker, stripPii |

---

## 9️⃣ Engines עצמאיים (4)

### 🧠 nexus_engine — NEXUS Autonomous Engine
Claude-driven orchestrator. 10 מודולים:
- calendar-orchestrator · cashflow-forecaster · competitor-intel · crisis-response-planner · document-extractor · google-ads-optimizer · lead-scorer · market-trend-analyzer · multi-language-translator · seo-content-generator

### 🧠 paradigm_engine — PARADIGM Engine v4.0
Autonomous Business OS, 10 חלקים, **60+ מודולים מכוסים:**
- **Core** (Part 1-2): CONFIG, Brain, Memory, ERP, CRM, BOM, HR, Finance, Ops
- **AI** (Part 3-4): Pricing, Quality, Notifications, Analytics, Swarm, Adversarial, Dream, MetaLearner, Goals, 7-phase orchestrator
- **Growth** (Part 5): GrowthEngine, CompetitiveIntel, IntegrationsHub, InternationalRealEstate
- **Intelligence** (Part 6): SupplyChainAI, TemporalIntelligence, DocumentAI, DashboardServer
- **Automation** (Part 7): AutomationEngine, SmartScheduler, SLAMonitor, CrossSellEngine, WarrantyProactive
- **Field Ops** (Part 8): FleetGPS, PhotoAI, KnowledgeBaseAI, PredictiveMaintenance, EmployeeWellness
- **Finance AI** (Part 9): ProfitabilityEngine, CashCollectionPredictor, MultiCurrency, WhatIfSimulator, SupplierNegotiationAI, Compliance
- **Communications** (Part 10): DocumentGenerator, LegalDocAI, VoiceAI, ConversationMemory, SocialMediaAutopilot, ReferralProgram, CustomerPortal

### 🏛️ enterprise_palantir_core — Python
- **16 API routers:** advanced, ai, analytics, command_center, engines, governance, ingest, intelligence, live, ontology, platform, security, spatial, ws
- **~55 engines** (בדומה לגדול של Palantir): action_engine, ai_orchestrator, anomaly_detection, autonomous_ai_operator, bayesian_beliefs, causal_inference, cdc_framework, change_point_detection, claude_adapter, counterfactual_explainer, geospatial_engine, graph_summarizer, graphql_layer, immutable_audit, kg_embeddings, multi_agent_reasoning, policy_engine, replay_engine, rl_bandit, scenario_planner, simulation_engine, timeline_playback, vector_search, workflow_engine...

### 🏛️ palantir_realtime_core — Python
- WebSocket hub, ingestion, ontology, state_engine, claude_adapter, data_quality_engine, identity_resolution_service, schema_registry_service, workflow_runtime

---

## 🔟 Pipeline Architecture — `src/pipeline/` (לב המערכת)

9 קבצי blueprint ב-`onyx-procurement/src/pipeline/`:

| קובץ | גודל | תפקיד |
|------|------|--------|
| **pipeline-engine.js** | 32KB | 13 שלבי Master Flow, ENTITY_RELATIONS, ENTITY_STATUSES, ENTITY_PAGES |
| **entity-map.js** | 28KB | 16+ ישויות עם labels עברית/אנגלית, icons, actions, related sections |
| **wiring-spec.js** | 27KB | SERVICE_OWNERSHIP, 22 entity relationships, 19 route groups, 55 action→API mappings, 7 cross-service contracts |
| **ontology.js** | 26KB | אונטולוגיה סמנטית |
| **domain-model.js** | 23KB | Domain model מלא |
| **state-machines.js** | 17KB | 13 מכונות מצב, 91 transitions |
| **orchestrator.js** | 15KB | **18 actions executable:** lead.create_quote, quote.approve, project.create_work_order, rfq.convert_to_po, po.receive_items, work_order.signoff, invoice.issue, payment.reconcile, payroll.calculate, ... |
| **workflow-flows.js** | 8KB | 5 business flows |
| **state-enforcement.js** | 5KB | middleware לאימות transitions |

---

## 1️⃣1️⃣ בסיס נתונים

### Supabase — 34 migrations
- **00000-00009:** Schema ראשי + RLS + RPCs + state machines
- **00010-00017:** הרחבות enterprise (60+ tables), read models, triggers, app_menu
- **00018-00029:** Control rooms, dashboards, AI agents, orchestration, security
- **00030-00033:** Enterprise seed, analytics views, treasury, demo seed 2026-04

### 46 Supabase Edge Functions
- **Entity CRUD:** create-customer, create-supplier, create-project, create-work-order, issue-invoice
- **State transitions:** approve-attendance, approve-po, approve-quote, reject-quote, send-quote, send-rfq, receive-po, convert-quote-to-project, change-project-state, register-payment
- **360 queries:** get-customer-360, get-employee-360, get-project-360
- **Workflow:** start-workflow-run, process-workflow-step, refresh-read-models, dispatch-domain-events
- **Jobs:** enqueue-job, claim-job, complete-job, fail-job, retry-stuck-jobs, requeue-agent-job, replay-dlq
- **AI:** classify-document, extract-document-fields, generate-knowledge-card, restart-agent
- **Inbox / Notifications:** create-inbox-item, assign-inbox-item, resolve-inbox-item, reopen-inbox-item, create-notification, acknowledge-notification, reopen-notification, resolve-notification
- **Admin:** save-kpi-definition, get-route-menu-permission-sync-status, run-route-menu-permission-sync, submit-attendance

### DB נוספים
- `database/erp_main.pglite` — PGlite embedded Postgres
- `onyx-procurement/migrations/999_add_perf_indexes.sql`
- `techno-kol-ops/src/db/schema.sql` (525 שורות) + `migration_v2.sql` (347 שורות, 18 tables נוספים)

---

## 1️⃣2️⃣ שפות (i18n)

| שפה | קוד | כיוון | פריטים |
|------|-----|-------|---------|
| עברית | he-IL | RTL | ברירת מחדל 🇮🇱 |
| English | en | LTR | |
| العربية | ar | RTL | |
| Русский | ru | LTR | |

**מונים של מחרוזות (i18n extraction 2026-04-11):**
- payroll-autonomous: 169 strings / 7 files
- onyx-ai: 94 strings / 14 files
- AI-Task-Manager: 20 strings / 11 files
- GPS-Connect: 1 string / 1 file

---

## 1️⃣3️⃣ Mobile App (React Native + Expo)

**11 מסכים:**
Login · Dashboard · Projects · WorkOrders · WorkOrderDetail · Materials · Employees · Finance · Alerts · AIAssistant · Profile

תיקיות: components, constants, navigation (AppNavigator.tsx), screens, services, store

---

## 1️⃣4️⃣ שירותי צד (Side projects במונורפו)

- **AI-Task-Manager** — pnpm monorepo, Universal Builder Engine + AI-managed modules; מכיל YAMLs מלאים: `MODULES_DETAIL_1-18`, `SYSTEM_FULL_SPEC`, `FINANCE_FULL_SPEC`, `CRM_ULTRA_SPEC`. מכוסה: Contract Lifecycle, HSE, CMMS, BI Reporting, Israeli Payroll, PWA, mobile offline sync.
- **GPS-Connect** — React + Vite + Leaflet/OpenStreetMap + Express 5 + PostgreSQL. מפה אינטראקטיבית, מעקב מיקום, שיתוף קוד, היסטוריה.

---

## 1️⃣5️⃣ Scheduled Jobs (vm-task-runner)

| Job | Cron | תפקיד |
|-----|------|-------|
| daily-kpi-snapshot | `5 0 * * *` | צילום KPI יומי → techno-kol-ops |
| payroll-monthly-close | `0 2 1 * *` | סגירת שכר חודשית ב-1 לחודש |
| vat-period-reminder | `0 9 14 * *` | תזכורת מע"מ דו-חודשי (14 לחודש) |
| procurement-rfq-followup | `0 10 * * 1-5` | מעקב אחר RFQ פתוחים (ימי חול) |
| ai-nightly-recommendations | `0 3 * * *` | ONYX_AI מייצר המלצות לילה |

---

## 1️⃣6️⃣ QA Coverage

**95+ קבצי QA-AGENT** מכסים:
- QA 08-17: Unit/Integration/API/UI/UX/A11y/Regression/Load/Compat/UAT/Migration
- QA 18-23: Backup/DR/Logging/Monitoring/Incident/SLA
- QA 24-35: Cost/License/GDPR/Israeli Privacy/Encryption/Pentest/CVE/Code Quality/Docs/i18n
- QA 36-50: Mobile/State Machine/Money/Timezone/Concurrency/Rate Limit/CSRF/Session/Email/WhatsApp/SMS/File Upload/PDF/Reporting/Audit Trail
- QA 51-74: Search/Notify/Vendor/Supplier Portal/Multi-tenant/CI-CD/ESLint/TypeScript/Bundle/PWA/HTTP Cache/CDN/DB/Postgres tuning
- QA 75-84: AI Model/Prompt Injection/LLM Cost/RAG/WebSocket/Sync/Event Sourcing/Queue/Webhook/Cron
- **QA 85-96 דיני עבודה ישראלי:** Payroll Law, ביטוח לאומי, מס הכנסה, פנסיה, פיצויים, חופשה/מחלה, טפסי 101/30A, חופשת לידה, עובדים זרים
- QA 140-146: VAT Report, Annual Tax, Bank Recon, Expenses, **Real Estate, Permits, Construction PM**

---

## 1️⃣7️⃣ תיעוד ברמת שורש (22 מסמכים)

| קטגוריה | מסמכים |
|---------|--------|
| Architecture | ARCHITECTURE, DATA_MODEL, SECURITY_MODEL, CLAUDE, MONOREPO, **SYSTEM_MAP_360 (זה)** |
| Deployment | DEPLOYMENT-RUNBOOK, DEPLOYMENT-RUNBOOK-VERCEL, DEPLOY, DEPLOY-PRODUCTION, GCP-DEPLOY |
| Operations | OPS_RUNBOOK, INTEGRATION_BRIDGE |
| User | QUICKSTART, FAQ, USER_GUIDE_HE |
| Compliance | COMPLIANCE_CHECKLIST, ISRAELI_TAX_CONSTANTS_2026, HEBREW_A11Y_AUDIT |
| QA | QA-AGENTS-PROMPTS, REPLIT_UNBLOCK_TASK_6 |
| History | CHANGELOG, SYSTEM_STATS |

---

## 1️⃣8️⃣ הרשאות (RBAC)

**7 תפקידים × 16 קבוצות הרשאות** (shared-permissions + shared-types):

תפקידים: admin · manager · viewer · employee · contractor · client · supplier

כל תפקיד קובץ מוגדר עם גרנולריות לכל entity ולכל פעולה.

---

## ✅ סיכום מצב המערכת

### יתרונות ברורים
- **ארכיטקטורה palantir-grade אמיתית** — event-sourced, knowledge graph, state machines, DAG orchestrator
- **כיסוי רגולטורי ישראלי עמוק** — מע"מ, דיני עבודה, ביטוח לאומי, ארנונה, היתרי בנייה
- **Pipeline מוגדרת היטב** — 13 שלבים, 18 actions, 13 state machines, 5 workflows, **הכל מתועד**
- **Shared packages מקצועיים** (8) — מונעים כפילויות
- **80+ מודולים עסקיים** — מכסים כל תחום ERP מקצה לקצה

### פערים ידועים
- ❌ **List routes ב-techno-kol-ops v3** מציגים "TODO" stub (9 routes)
- ❌ **Employee360 ייעודי ב-payroll-autonomous** — רק EmployeesTab (חסר)
- ❌ **RFQ360 + PO360 TSX components** — קיימים רק כ-HTML ב-onyx-procurement
- ❌ **vm-task-runner handlers** — כולם placeholders (TODO wiring)
- ❌ **Tests ב-onyx-ai ו-vm-task-runner** — חסרים לגמרי
- ⚠️ **app_menu ב-Supabase** — טבלה קיימת (migration 00017) אבל אין seed
- ⚠️ **Router ב-onyx-ai** — hand-rolled if/else ב-2700-line index.ts (למרות ש-Express מותקן)
- ⚠️ **onyx-procurement/server.js** — 1,837 שורות monolithic

---

_מסמך זה נוצר אוטומטית ב-{{date}} ע"י סריקה מלאה של 4 סוכנים במקביל._
_כל ממצא קושר חזרה לקבצים אמיתיים בקוד._
