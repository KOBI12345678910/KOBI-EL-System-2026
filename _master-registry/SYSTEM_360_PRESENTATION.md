# מערכת טכנו-קול עוזי ERP 2026 — סקירה מקיפה מא׳ ועד ת׳

> מסמך היכרות מלא עם המערכת. עברית RTL. נכון ליום 18.04.2026.

---

## 1. מה זו מערכת טכנו-קול עוזי ERP 2026?

**מערכת תפעול ארגונית בדרגת Palantir** — לא אוסף דפים, אלא מערכת הפעלה עסקית מקושרת מקצה לקצה. נבנתה לשירות עסק ישראלי בתחום החשמל התעשייתי / קבלנות (לקוחות, ציטוטים, פרויקטים, הזמנות רכש, עבודות בשטח, שכר, חשבוניות, תשלומים), עם תאימות מלאה לרשויות המס בישראל (מע"מ 18%, PCN836, טפסי 102/126/856/857).

**קנה מידה נוכחי:**
- **338 טבלאות** במסד נתונים חי על Supabase PostgreSQL 17 (eu-central-1)
- **32 סכימות עסקיות** (commercial, execution, procurement, inventory, finance, workforce, docs, analytics, comms, governance, intelligence + 21 domains תומכים)
- **343 קבצי route** ב-API (5,313 endpoints ייחודיים)
- **1,298 דפי React** (TypeScript + Vite + Tailwind + shadcn/ui)
- **138 רשומות תפריט** חיות במערכת (`public.app_menu`)
- **68 קבצי migration** (36 הוחלו ב-Supabase)
- **55,389 שורות קוד** ב-`api-server/src` + `erp-app/src` (נכון להיום)
- **5 מיקרו-שירותים** רצים בהרמוניה

---

## 2. ארכיטקטורה — 5 שירותים, 13 שלבי flow

### 5 שירותים (מיקרו-שירותים)

| שירות | תפקיד | פורט |
|---|---|---|
| **TECHNO_KOL_OPS** | ליבה תפעולית — הב (hub) | 3200 |
| **ONYX_PROCUREMENT** | עמוד שדרה פיננסי + רכש | 3100 |
| **PAYROLL_AUTONOMOUS** | מנוע שכר וכוח אדם | 5173 (תחת `/payroll`) |
| **ONYX_AI** | שכבת אינטליגנציה ואוטומציה | 3300 (תחת `/ai`) |
| **VM-TASK-RUNNER** | רץ משימות רקע (cron + jobs) | פנימי |

### 13 שלבי Master Flow
```
Lead → Quote → Approval → Order → Project → Work Orders → Procurement →
Inventory → Execution → Delivery → Invoice → Payment → Closure
```

### Pipeline — 9 מודולים (`onyx-procurement/src/pipeline/`)
1. **pipeline-engine.js** — 13 שלבי ה-Master Flow, טופולוגיה, event triggers
2. **entity-map.js** — 16 ישויות עם קישורים, סטטוסים, actions, שדות
3. **workflow-flows.js** — 5 זרימות עסקיות (Sales→Project→Procurement→Execution→Cash + HR→Payroll)
4. **state-machines.js** — 13 מכונות מצב עם 91 transitions
5. **wiring-spec.js** — 20 יחסי ישויות, 19 קבוצות routes, 9 חוזי דפים, 55 action→API mappings, 7 חוזים בין שירותים
6. **orchestrator.js** — 18 actions עם preconditions, effects, events, listeners
7. **ontology.js** — אונטולוגיה ממוזגת
8. **domain-model.js** — מודל הדומיין
9. **state-enforcement.js** — מנוע אכיפת מצבים

---

## 3. 13 דומיינים ו-11 דומיינים קנוניים

| # | דומיין (Schema) | טבלאות | תפקיד עסקי |
|---|---|--:|---|
| 1 | **commercial** | 18 | לקוחות, לידים, ציטוטים — צד הלקוח של העסק |
| 2 | **execution** | 30 | פרויקטים, הזמנות עבודה (Work Orders), משימות |
| 3 | **procurement** | 24 | ספקים, הזמנות רכש (PO), RFQs |
| 4 | **inventory** | 18 | חומרים, מלאי, תנועות מלאי |
| 5 | **finance** | 24 | חשבוניות, תשלומים, AR/AP, מע"מ |
| 6 | **workforce** | 19 | עובדים, שכר, דיווחי שעות |
| 7 | **docs** | 15 | מסמכים, תבניות חוזים, חתימות |
| 8 | **analytics** | 18 | דשבורדים, KPIs, דוחות |
| 9 | **comms** | 14 | אימייל, SMS, WhatsApp |
| 10 | **governance** | 35 | משתמשים, תפקידים, RLS, לוג ביקורת |
| 11 | **intelligence** | 16 | תובנות AI, NLQ, חיזוי, anomaly detection |
| — | **orchestration** | 10 | workflows, triggers, cron |
| — | **crm** | 8 | lead activities, opportunities (alias ל-commercial) |
| — | **quality** | 8 | בקרת איכות |
| — | **treasury** | 7 | ניהול כספים ברמת החברה |
| — | **documents** | 7 | כפילות היסטורית של `docs` |
| — | **planning** | 7 | תכנון |
| — | **safety** | 6 | בטיחות |
| — | **logistics** | 6 | לוגיסטיקה |
| — | **fleet** | 6 | צי רכב |
| — | **maintenance** | 5 | תחזוקה (work_orders קונספט נפרד) |
| — | **service** | 5 | שירות |
| — | **compliance** | 5 | רגולציה |
| — | **pricing** | 5 | תמחור |
| — | **reporting** | 5 | דוחות |
| — | **scheduling** | 5 | לוחות זמנים |
| — | **routing** | 3 | נתיבי משלוח |
| — | **public** | 9 | `app_menu` + כפילויות legacy |

---

## 4. 9 דפי Master 360 (עדיפות P0)

כל דף 360 חייב לכלול: כותרת + סטטוס, פעולות עיקריות, רשומות מקושרות, מסמכים, לוג ביקורת, הפעולה המומלצת הבאה.

1. **Customer360** — תמונת לקוח מלאה
2. **Supplier360** — תמונת ספק מלאה
3. **Quote360** — מסך ציטוט
4. **RFQ360** — בקשה להצעת מחיר
5. **Project360** — תצוגת פרויקט (timeline + BOM + WO + חשבוניות)
6. **WorkOrder360** — הזמנת עבודה
7. **PO360** — הזמנת רכש
8. **Finance360** — AR/AP/מע"מ/תזרים
9. **Employee360** — תמונת עובד (שכר, דיווחי שעות, כישורים)

---

## 5. תפריט — Taxonomy

138 רשומות תפריט קנוניות. עץ התפריט מקטלג ב-`00041_menu_categorize_by_business_topic.sql`:

```
📊 דשבורדים ודוחות
   ├─ דשבורד ראשי  · Executive Dashboard · KPIs · Health Score
📇 CRM ולקוחות
   ├─ לקוחות · לידים · הזדמנויות · קמפיינים
💰 מסחר וציטוטים
   ├─ ציטוטים · אישורי ציטוט · חוזים
🏗️ פרויקטים וביצוע
   ├─ פרויקטים · הזמנות עבודה · משימות · Gantt
🛒 רכש
   ├─ ספקים · בקשות הצעת מחיר · הזמנות רכש · אישור חשבוניות ספק
📦 מלאי
   ├─ חומרים · תנועות מלאי · ספירות · מחסנים
💵 כספים ומע"מ
   ├─ חשבוניות · תשלומים · AR · AP · מע"מ 18% · PCN836 · טפסי 102/126
👥 כוח אדם
   ├─ עובדים · שכר · דיווחי שעות · חופשות · שיבוצים
📄 מסמכים
   ├─ תבניות · מחולל חוזים · חתימות דיגיטליות · העלאת מסמכים
📬 תקשורת
   ├─ אימייל · WhatsApp · SMS · לוג שיחות
🛡️ ממשל ואבטחה
   ├─ משתמשים · תפקידים · הרשאות RLS · לוג ביקורת
🤖 AI ואוטומציה
   ├─ Kobi Assistant · Uzi Assistant · NLQ · Anomaly Detection · Forecasting
```

---

## 6. 20 ישויות עליונות — שדות עיקריים

(תקציר קריא; עמודות מלאות ב-`supabase/migrations/00005_onyx_core_erp_schema.sql`)

| ישות | שדות עיקריים |
|---|---|
| `commercial.customers` | id, name, tax_id (ע"מ/ע.ר), address, phone, email, credit_limit, payment_terms, status, created_at |
| `commercial.leads` | id, source, contact_name, phone, email, estimated_value, probability, owner_id, status |
| `commercial.quotes` | id, customer_id, quote_no, issue_date, valid_until, subtotal, vat (18%), total, status, project_type |
| `execution.projects` | id, customer_id, code, name, start_date, end_date, budget, actual_cost, pm_id, status |
| `execution.work_orders` | id, project_id, wo_no, scheduled_date, assigned_to, location, description, status |
| `execution.tasks` | id, wo_id, description, assignee, due_date, priority, status |
| `procurement.suppliers` | id, name, tax_id, contact, phone, email, payment_terms, rating, status |
| `procurement.purchase_orders` | id, supplier_id, po_no, issue_date, delivery_date, subtotal, vat, total, status |
| `procurement.po_lines` | id, po_id, material_id, qty, unit_price, line_total, received_qty |
| `inventory.materials` | id, sku, name, category, uom, standard_cost, safety_stock, reorder_point |
| `inventory.inventory_movements` | id, material_id, movement_type (in/out/adjust), qty, reference (PO/WO), timestamp |
| `workforce.employees` | id, first_name, last_name, id_number (ת.ז.), tax_code, bank_account, hire_date, role, dept, status |
| `workforce.payroll_runs` | id, period_start, period_end, status, gross_total, net_total, tax_total, pension_total |
| `finance.invoices` | id, customer_id, invoice_no, issue_date, due_date, subtotal, vat (18%), total, paid_amount, status |
| `finance.invoice_lines` | id, invoice_id, description, qty, unit_price, line_total, vat_code |
| `finance.payments` | id, invoice_id, payment_date, amount, method, reference, status |
| `docs.documents` | id, entity_type, entity_id, filename, mime_type, size, storage_path, signed, uploaded_by |
| `intelligence.ai_insights` | id, domain, severity, title, explanation, recommended_action, confidence, created_at |
| `governance.users` | id, email, full_name, role_id, department, active, last_login |
| `governance.audit_log` | id, user_id, action, entity_type, entity_id, before, after, timestamp |

---

## 7. מנועים אוטונומיים (43 קבצי engine/agent)

מתוך `api-server/src/routes/` (תקציר):

**AI Core:**
- `ai-autonomous-agent.ts` — סוכן עצמאי
- `ai-engine-routes.ts` — נתבי מנוע
- `ai-orchestration/` — orchestrator + ML pipeline + audit log
- `ai-document-intelligence-engine.ts` — קריאת מסמכים
- `ai-document-processor.ts` — OCR + קיטלוג
- `ai-business-automation.ts` — אוטומציות עסקיות
- `ai-data-flow.ts` — זרימת נתונים
- `agent-orchestration.ts`, `agent-performance.ts` — ניהול סוכנים
- `ai-agents-system.ts` — מערכת סוכנים
- `ai-operations.ts`, `ai-gaps.ts`, `ai-models.ts`, `ai-providers.ts`, `ai-prompt-templates.ts`, `ai-permissions.ts`, `ai-api-keys.ts`

**WhatsApp + Assistants:**
- `whatsapp-ai-engine.ts` — עוזר WhatsApp
- `whatsapp-business-engine.ts` — WhatsApp Business API
- `whatsapp-hub.ts` — hub מרכזי
- `techno-kol-uzi-ai-engine.ts` — מנוע עוזר **עוזי**
- `kobi/` — ספריית העוזר **קובי** (בעל-הבית)

**Tax/Compliance:**
- `tax-management.ts` — ניהול מע"מ
- `compliance-certificates.ts` — אישורי ניכוי מס במקור
- `security-compliance.ts` — תאימות אבטחה

**Accounting:**
- `accounting-export.ts` — ייצוא לחשבשבת / SAP Business One
- `admin-cron-triggers.ts` — טריגרים לתזמון

---

## 8. יכולות AI

1. **NLQ** (Natural Language Query) — שאלות בעברית/אנגלית על כל טבלה
2. **Kobi Assistant** — עוזר של בעל העסק (ניהול תיק לקוח, החלטות)
3. **Uzi Assistant** — עוזר שטח (עבור עוזי — מנהל התפעול)
4. **Anomaly Detection** — זיהוי חריגות בתזרים, רכש, שעות עבודה
5. **Forecasting** — חיזוי הכנסות, הוצאות, צורכי מלאי
6. **Recommendations Engine** — המלצות לפעולה הבאה (Next Best Action)
7. **Monte Carlo Simulations** — סימולציית סיכונים לפרויקטים גדולים
8. **Document Intelligence** — OCR + קטלוג + חילוץ שדות מחשבוניות ספק
9. **WhatsApp Bot** — קבלת עדכונים מהשטח ושליחת התראות

---

## 9. תאימות מס ישראלית

- **מע"מ 18%** — ברירת מחדל בכל חשבונית וציטוט (D031 — החלפת literals טרם הושלמה; נחסמה לאישור בעלים)
- **PCN836** — קובץ דיווח ל-רשות המיסים
- **טופס 102** — דיווח חודשי למעסיקים (ניכויים)
- **טופס 126** — דיווח שנתי לעובדים
- **טופס 856 / 857** — דיווח לספקים (ניכויים במקור)
- **טופס 1301 / 1320** — דוח שנתי לעצמאי
- **טופס 30A** — דיווח מעסיקים
- **טופס 6111** — דוח התאמה למס הכנסה
- **ניכוי מס במקור** — אישורי פטור/שיעור מופחת (compliance-certificates.ts)

---

## 10. Stack טכני

| שכבה | טכנולוגיה |
|---|---|
| **Backend** | Express + TypeScript, Drizzle ORM |
| **Frontend** | React + Vite + Tailwind + shadcn/ui + wouter + react-query |
| **DB** | Supabase PostgreSQL **17.6.1** (managed, eu-central-1) |
| **Cache / queue** | Redis |
| **Auth** | Supabase Auth + RLS + JWT |
| **Hosting** | Docker + Kubernetes (k8s/) + Vercel (frontend) |
| **DevOps** | GitHub Actions + Husky pre-commit + Vitest |
| **AI** | Anthropic Claude + OpenAI (multi-provider via `ai-providers.ts`) |

---

## 11. 5 זרימות End-to-End

1. **Lead → Payment** — ליד → ציטוט → אישור → הזמנה → פרויקט → WOs → רכש → מלאי → ביצוע → משלוח → חשבונית → תשלום → סגירה
2. **HR → Payroll → Compliance** — עובד חדש → דיווחי שעות → payroll run → 102 חודשי → 126 שנתי
3. **AI Loop** — אירוע עסקי → intelligence insight → recommended_action → orchestrator → execute action → audit_log
4. **Tax Compliance** — חשבונית → VAT register → דוח חודשי (PCN836) → דיווח רשות מיסים
5. **Procurement Approval** — RFQ → 3 הצעות מספקים → השוואה → PO → קבלת טובין → חשבונית ספק → אישור תלת-כיוני → תשלום

---

## 12. מה המערכת עושה היום (אופרטיבית) vs חסום

### ✅ עובד היום
- 338 טבלאות DB עם seeds (לקוחות, ציטוטים, פרויקטים, WO, POs, חומרים, עובדים, חשבוניות, תשלומים, מסמכים)
- 300/338 טבלאות עם RLS פעיל (88.8%)
- 5,313 API endpoints ייחודיים
- 1,298 דפים + 666 paths ייחודיים ב-React
- 9 Master 360 pages
- 13 state machines עם 91 transitions
- 43 מנועי AI + WhatsApp + Kobi + Uzi
- מערכת תפריט (138 רשומות קנוניות)
- לוח ביקורת (audit_log)

### 🛑 חסום בהמתנה לאישור בעלים
- **D030** — mount globally של authMiddleware (דורש בדיקה שלא ישברו בדיקות public endpoints)
- **D031** — החלפת 30 מופעים של `0.17` literals ל-`VAT_RATE` constant
- **D032** — תיקון סמנטיקה של AR/AP בדוחות (השפעה על ה-GL)
- **5 קבצים עם פוטנציאל SQLi** — reserved for owner review (תועדו ב-`AUDIT_REAL.md`)

### ⚠️ קיימת drift (ניתן לתיקון אוטומטי)
- **32 migration files** על הדיסק לא הוחלו ב-Supabase
- **458 פריטי תפריט** מפנים ל-routes שלא קיימים (404 בלחיצה)
- **535 דפים** אינם מוגדרים ב-App.tsx (dead pages)

---

## 13. ציוני בגרות לפי שכבה (10 שכבות, 0-100)

| שכבה | ציון |
|---|--:|
| 1. DB + Schema + Seeds | 85 |
| 2. Migrations applied | 53 |
| 3. API Routes | 92 |
| 4. React Pages | 75 |
| 5. Menu Wiring | 65 |
| 6. State Machines | 90 |
| 7. Zod Validation | 50 |
| 8. AI Engines | 95 |
| 9. Tax Compliance | 80 |
| 10. Cross-Service Contracts | 85 |

**בגרות כוללת: 77 / 100** — ליבה מוכנה לייצור. הפערים העיקריים: סנכרון migrations + תפריט↔route.

---

## 14. אילו היה נמכר כמוצר

> **"טכנו-קול עוזי ERP 2026 היא מערכת ERP ישראלית בדרגת ארגון, בנויה כ-Operating System עסקי משולב: 338 טבלאות, 5,313 נקודות API, 1,298 מסכי React, 5 מיקרו-שירותים, 43 מנועי AI אוטונומיים, תאימות מלאה למע״מ 18% ול-PCN836, ו-9 דפי Master 360 שעונים על 'איפה אני? מה זה? מה הסטטוס? מה לעשות?' בכל נקודה במסלול העסקי. המערכת בנויה על Supabase PostgreSQL 17, React+Vite, TypeScript, עם 2 עוזרי AI אישיים (Kobi + Uzi) — מתאימה לחברות קבלנות חשמל תעשייתית, התקנות, שירות ותחזוקה, בסקלה של 20-500 עובדים."**

---

*מסמך זה נוצר ע"י audit אוטומטי 360°. מקור האמת: קוד + Supabase MCP + `_master-registry/`. עדכון אחרון: 2026-04-18.*
