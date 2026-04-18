# QA Agent #146 — Construction Project Management (Gantt / Milestones / Critical Path)

**Date:** 2026-04-11
**Scope:** Cross-project static analysis
**Dimension:** Construction Project Management — Gantt, milestones, critical path, resources, dependencies, Israeli construction phases
**Language:** Hebrew
**Status:** PASS WITH GAPS — core CPM/Gantt implemented in AI-Task-Manager; techno-kol-ops uses a different pipeline model; onyx-procurement has no PM surface.

---

## 1. Executive Summary (תמצית מנהלים)

בדיקה חוצת-פרויקטים של יכולות ניהול פרויקטי בנייה מגלה **שני עולמות מקבילים**:

- **AI-Task-Manager / ERP (ה-"מערכת 2026")** — מימוש מקיף של גאנט מקצועי עם WBS, CPM אמיתי (Forward/Backward Pass), תלויות 4 סוגים (FS/SS/FF/SF), baseline, ו-total/free float. זה המודול הקרוב ביותר ל-MS Project / Primavera.
- **techno-kol-ops** — מודל שונה לגמרי: "pipeline stages" קווי של פרויקט התקנה (deal_closed → measurement → production → installation → handover), ללא WBS ריאלי וללא CPM.
- **onyx-procurement** — אין מודול PM. עוסק רק ב-RFQ, ספקים, חומרים.

הפערים הקריטיים: אין phase definitions ישראליות תקניות (יסודות/שלד/גמר), אין ניהול מזג אוויר/חגים, אין משאבים פיזיים כגון מנופים/תבניות, ואין אינטגרציה דו-כיוונית בין ה-Gantt הכללי של AI-Task-Manager לבין ה-pipeline של techno-kol-ops.

---

## 2. Projects Table (טבלת פרויקטים)

### 2.1 AI-Task-Manager — `projects`
**Source:** `AI-Task-Manager/artifacts/api-server/src/routes/projects-module.ts` (PROJECT_SELECT), `AI-Task-Manager/artifacts/api-server/src/app.ts` (schema generation)

**שדות:**
```
id, project_number, project_name, project_type, description,
customer_name, customer_id, site_address, manager_name,
status, phase, start_date, end_date,
estimated_revenue (budget), actual_cost (spent),
completion_pct, priority, department, contract_amount,
created_at, updated_at, deleted_at
```

**הערכה:** ✅ טבלת פרויקטים עשירה, עם שדה `phase` כטקסט חופשי (לא enum) + `completion_pct`. תמיכה ב-soft-delete. Portfolio KPIs מחושבים ב-`/portfolio-kpis` (on-time rate, on-budget rate, avg completion).

### 2.2 techno-kol-ops — `projects`
**Source:** `techno-kol-ops/src/db/schema.sql:380`

**מודל שונה:** טבלת `projects` מייצגת הזמנת **התקנה** בודדת ולא פרויקט בנייה רב-חודשי:
```
project_number, order_id, client_id, title, address, lat/lng,
total_price, advance_paid, balance_due (generated),
current_stage (pipeline_stage enum),
surveyor_id, production_manager_id, contractor_id,
installer_id, driver_id, project_manager_id,
measurement_date, contract_sent_at, contract_signed_at,
materials_ordered_at, materials_arrived_at,
production_start_at, production_end_at,
installation_date, installation_started_at, installation_done_at,
closed_at, survey_score, notes
```

**הערכה:** ✅ מתאים ל-"פרויקט מוצר בודד" (התקנת חלונות/דלתות/מטבחים). ⚠️ **לא מתאים** לפרויקט בנייה רב-שלבי — חסר חלוקה היררכית ל-WBS, אין duration לכל שלב, אין תלויות.

### 2.3 onyx-procurement
**אין טבלת projects**. מודל הנתונים כולל RFQ, suppliers, materials בלבד.

---

## 3. Tasks & Milestones (משימות ואבני דרך)

### 3.1 AI-Task-Manager — `project_tasks` + `project_milestones`
**Source:** `AI-Task-Manager/artifacts/api-server/src/app.ts:964`, `projects-module.ts:140-264`, `projects-module.ts:503-554`

**`project_tasks` schema (מורחב ב-routes):**
```
id, project_id, parent_task_id, wbs_code, sort_order,
title, description, assignee, status, priority,
due_date, estimated_hours, actual_hours, tags,
duration, planned_start, planned_end, actual_start, actual_end,
is_milestone, is_critical,
baseline_start, baseline_end,
early_start, early_finish, late_start, late_finish,
total_float, free_float
```

**`project_milestones` schema:**
```
id, project_id, title, description, due_date, target_date,
status, completion_percent, payment_amount
```

**יכולות מתקדמות:**
- ✅ **WBS אמיתי** — עם `parent_task_id` + `wbs_code` מחושב אוטומטית (`generateWbsCode`)
- ✅ **אבני דרך מובנות** — דרך דגל `is_milestone` + טבלת milestones נפרדת
- ✅ **Baseline** — `save-baseline` מעתיק planned → baseline לצורך השוואת תכנון/ביצוע
- ✅ **Payment milestones** — `payment_amount` בטבלת milestones → קושר לגביה על-פי בסיס אבני דרך

**`milestones-page.tsx` — UI מלא:**
- CRUD + חיפוש + סינון + מיון + pagination + bulk
- סטטוסים: `not_started`, `in_progress`, `completed`, `delayed`, `at_risk`, `cancelled`
- KPIs: שיעור השלמה, אבני דרך מאחרות, סה"כ
- ✅ תמיכה ב-RTL + תרגום עברי מלא
- ✅ Attachments + ActivityLog + BulkActions + FormValidation

### 3.2 techno-kol-ops — אין tasks או milestones רשמיים
המערכת משתמשת ב-`pipeline_events` — event log של פעולות בכל שלב, לא משימות מתוכננות. **פער משמעותי לצורכי ניהול בנייה.**

---

## 4. Gantt Visualization (ויזואליזציית גאנט)

### 4.1 `gantt-chart-page.tsx` — מימוש מקצועי
**Source:** `AI-Task-Manager/artifacts/erp-app/src/pages/projects/gantt-chart-page.tsx` (650+ שורות)

**יכולות מוכחות ב-code review:**

| יכולת | מימוש | הערות |
|---|---|---|
| Zoom levels | ✅ יום/שבוע/חודש/רבעון | `ZOOM_CELL_W`, `ZOOM_DAYS` |
| WBS Tree | ✅ | `buildWbsTree` + `flattenTree` + expand/collapse |
| Task bars (SVG) | ✅ | `getBarBounds` — כולל תמיכה ב-duration אוטומטי |
| Baseline bars | ✅ | `getBaselineBounds` — קו אפור משני ל-baseline |
| Today line | ✅ | קו כחול מקווקו |
| Critical path highlighting | ✅ | `is_critical` → אדום + CP badge |
| Milestones (יהלומים) | ✅ | `is_milestone` → `<Diamond>` icon |
| Dependency arrows | ✅ | `depArrows` — מחושב דינמית בין bars |
| Drag-to-reschedule | ✅ | `handleMouseDown/Move/Up` → update API |
| CSV Export | ✅ | `exportCSV` — WBS/title/status/start/end/duration/float/critical |
| Nav (היום, +/- 4 weeks) | ✅ | viewOffset + zoom-aware stepping |
| RTL Hebrew | ✅ | `dir="rtl"`, labels עבריים |

**חולשות:**
- ❌ אין זום mouse-wheel
- ❌ אין resize של bars (רק drag horizontal)
- ❌ אין print-optimized view / PDF export
- ❌ אין הדגשת weekends / חגים ישראליים
- ❌ drag מעדכן רק את `plannedStart` — לא את dependencies בקסקדה

### 4.2 techno-kol-ops — אין Gantt
המערכת מציגה `pipeline stages` אופקיים (kanban-like) ב-`pages/Pipeline.tsx` — **לא גאנט.**

---

## 5. Critical Path Method — CPM (נתיב קריטי)

### 5.1 מימוש אמיתי ב-projects-module.ts
**Source:** `AI-Task-Manager/artifacts/api-server/src/routes/projects-module.ts:326-501`

**פונקציה:** `calculateCriticalPath(projectId)` + `topologicalSort`

**האלגוריתם (בדיקה מדויקת):**

```
1. Load all tasks + dependencies for project
2. Build successors + predecessors maps
3. Topological sort (DFS-based, recursive visit)
4. Forward Pass — Early Start / Early Finish:
   - For each dep, calculate:
     FS: ES = predEF + lag
     SS: ES = predES + lag
     FF: ES = predEF + lag - duration
     SF: ES = predES + lag - duration
   - ES = max(all pred_ES)
   - EF = ES + duration
5. projectDuration = max(all EF)
6. Backward Pass — Late Start / Late Finish:
   - For each successor dep:
     FS: LF = succLS - lag
     SS: LF = succLS - lag + duration
     FF: LF = succLF - lag
     SF: LF = succLF - lag + duration
   - LF = min(all succ_LS)
   - LS = LF - duration
   - Total Float = LS - ES
   - isCritical = (totalFloat <= 0)
7. Free Float calculation (3rd pass):
   - freeFloat = min(succ_ES) - EF
8. Bulk UPDATE all tasks with calculated fields
9. Return { projectDuration, criticalPathCount, tasks }
```

**הערכה:** ✅✅ מימוש **אמיתי ונכון** של CPM — לא mock. כל 4 סוגי התלויות נתמכים + lag. ה-UI מפעיל `/project-tasks/calculate-critical-path/:projectId` דרך כפתור "נתיב קריטי" ב-Gantt.

**פערים:**
- ⚠️ אין תמיכה ב-calendars (שבתות/חגים/עובדים דו-משרתיים) — duration נספר בימים קלנדריים
- ⚠️ אין Monte Carlo / PERT לחישוב הסתברויות (קיים `monteCarloEngine.ts` ב-techno-kol-ops אבל לא מחובר ל-PM)
- ⚠️ אין resource leveling — הנתיב הקריטי מחושב ללא מגבלות משאבים
- ⚠️ ה-topologicalSort עלול לתת סדר שגוי אם יש מעגל (cycle) — אין בדיקה

---

## 6. Resource Allocation (הקצאת משאבים)

### 6.1 `project_resources` (basic)
**Source:** `AI-Task-Manager/artifacts/api-server/src/app.ts:951-963`

```
id, project_id, resource_type (human/default),
name, allocation_pct, cost_per_hour,
start_date, end_date
```

### 6.2 `project_resources_sap` (extended SAP upgrade)
**Source:** `AI-Task-Manager/artifacts/api-server/src/routes/projects-sap-upgrade.ts:65-86`

```
resource_type CHECK IN ('employee','contractor','equipment','material'),
role, allocation_percent (0-100),
hourly_rate, planned_hours, actual_hours,
start_date, end_date,
cost_to_date,
status ('planned','active','released','completed')
```

**הערכה:** ✅ מבנה נתונים תקין לקבלן בנייה — מבדיל עובד/קבלן-משנה/ציוד/חומר, עוקב תכנון מול ביצוע כולל cost_to_date.

**מה חסר:**
- ❌ אין `project_resources` ↔ `project_tasks` M:N mapping — כל טאסק לא יודע איזה משאבים צרכניים (רק assignee אחד)
- ❌ אין `resource_calendars` — זמינות יומית
- ❌ אין conflict detection — אם עובד מוקצה 150% בין שני פרויקטים
- ❌ אין `crane`/`formwork`/`scaffolding` כסוגי equipment ייחודיים לבנייה

### 6.3 Command Center — הצגת allocation
**Source:** `projects-command-center.tsx:53-60`

ה-fallback mock מציג: name, role, projects, utilization %, hours, capacity — כלומר ה-UI מוכן, אבל התצוגה אינה מחוברת לחישוב amoristic מה-tasks בפועל.

---

## 7. Dependencies (תלויות)

### 7.1 `project_task_dependencies`
**Source:** `projects-module.ts:285-324`

```
id, project_id, predecessor_id, successor_id,
dependency_type ('FS','SS','FF','SF'),
lag_days (integer)
```

**הערכה:** ✅ מבנה תקני לחלוטין. תמיכה בכל 4 סוגי ה-dependencies + lag (חיובי=delay, שלילי=lead).

**UI:** `gantt-chart-page.tsx` — טופס "הוסף תלות" עם בחירת predecessor/successor + type dropdown + lag input. החצים מצוירים ב-SVG אוטומטית.

**פער:**
- ❌ אין validation של cycle detection לפני שמירה — ניתן ליצור מעגל שיגרום לנפילת CPM
- ❌ אין תלויות חיצוניות (cross-project) או על milestones (רק task → task)

---

## 8. Israeli Construction Phases (שלבי בנייה ישראליים)

### 8.1 פערים מהותיים — אין תקן ישראלי מובנה

בחיפוש מקיף של `יסודות`, `שלד`, `גמר`, `חפירה`, `בטון`, `טיח`:

| מונח | מצב | מיקום |
|---|---|---|
| שלד | ✅ מוזכר | `contractors.tsx` TRADES, `subcontractors.tsx`, `projects-command-center.tsx` (milestone: "סיום שלב שלד") |
| גמר | ✅ מוזכר | `contractors.tsx` TRADES, `units.tsx` STATUSES (תכנון/בבנייה/גמר/מוכר) |
| יסודות | ❌ לא מוזכר | — |
| חפירה | ⚠️ `היתר חפירה` | `real-estate/permits.tsx` PERMIT_TYPES |
| בטון | ⚠️ "עבודות בטון" | טקסט חופשי בקוד |
| טיח | ❌ לא מוזכר | — |

**המסקנה:** ❌ אין **phase_definitions** או **construction_lifecycle** כ-enum / seed data. המונחים מופיעים רק כ-(א) רשימת מקצועות קבלן-משנה, (ב) טקסט fallback, (ג) בשדה `phase` חופשי.

### 8.2 מה צריך להוסיף

**הצעה לסכימה:**
```sql
CREATE TABLE construction_phase_templates (
  id SERIAL PRIMARY KEY,
  phase_code VARCHAR(50),         -- 'EXCAVATION','FOUNDATION','SKELETON','FINISH','HANDOVER'
  phase_name_he TEXT,              -- 'חפירה ודיפון','יסודות','שלד','גמר','מסירה'
  phase_name_en TEXT,
  sort_order INTEGER,
  typical_duration_days INTEGER,
  trades TEXT[],                   -- ['excavator','rebar','concrete']
  deliverables TEXT[],
  regulatory_checks TEXT[]         -- 'היתר חפירה','בדיקת בטון','טופס 4'
);
```

**Phases ישראליים תקניים (חסרים כולם):**
1. **הכנת אתר** — גידור, התארגנות
2. **חפירה ודיפון** — חפירת יסודות, דיפון
3. **יסודות** — ברזל, בטון יסודות, איטום
4. **שלד** — קומות, קורות, תקרות, עמודים
5. **קירות ומחיצות** — בלוקים, טיח פנים וחוץ
6. **מערכות (MEP)** — חשמל, אינסטלציה, מיזוג
7. **גמר** — ריצוף, צבע, דלתות, חלונות, מטבח
8. **פיתוח חצר** — שבילים, גינון
9. **מסירה וטופס 4** — בדיקות, אישור אכלוס

---

## 9. Cross-Project Integration (אינטגרציה חוצת-מערכות)

### 9.1 Mapping בעיות

| שאלה | AI-Task-Manager | techno-kol-ops | onyx-procurement |
|---|---|---|---|
| יש `projects` table? | ✅ עם phase + dates | ✅ עם pipeline_stage enum | ❌ |
| יש WBS + CPM? | ✅ מלא | ❌ | ❌ |
| יש Gantt UI? | ✅ מקצועי | ❌ (kanban בלבד) | ❌ |
| תלויות? | ✅ 4 סוגים + lag | ❌ | ❌ |
| משאבים? | ✅ SAP-style | ⚠️ דרך employees | ❌ |
| שלבים ישראליים? | ⚠️ phase חופשי | ⚠️ pipeline_stage enum (לא בנייה) | ❌ |
| ID format | `project_number` | `project_number` | — |
| Customer reference | `customer_id` (INT) | `client_id` (UUID) | — |

### 9.2 חוסר integration
- ❌ אין foreign key או JOIN מ-`techno-kol-ops.projects` ל-`AI-Task-Manager.projects`
- ❌ schemas שונים (INT vs UUID) → merge מורכב
- ❌ ה-`onyx-procurement.RFQ` לא קשור לפרויקט ספציפי — רק לספק
- ❌ אין EventBus משותף — למרות ש-techno-kol-ops כולל `eventBus.ts` + `websocket.ts`, AI-Task-Manager לא מקבל אירועים ממנו

---

## 10. Security & Authorization

- ✅ `requireErpAuth` middleware ב-`projects-module.ts:15-23` — כל endpoint דורש Bearer token + validateSession
- ✅ Soft-delete על projects (`deleted_at IS NULL`)
- ⚠️ אין RBAC — כל משתמש עם session רואה את כל הפרויקטים
- ⚠️ אין audit log ב-critical-path calculation (פעולה יקרה שיכולה להשתנות את כל הצפי)
- ❌ אין חתימה דיגיטלית על baseline — אפשר לדרוס baseline בלי track record

---

## 11. Performance Considerations

- ✅ `project_tasks` query משתמש ב-`sort_order` + `wbs_code` (כפי הנראה עם index)
- ⚠️ `calculateCriticalPath` — יש `Promise.all` על UPDATE של כל task — OK ל-100 tasks, problematic ל-1000+
- ⚠️ `topologicalSort` רקורסיבי — stack overflow אפשרי אם graph גדול מאוד
- ⚠️ Gantt UI טוען את כל tasks של פרויקט פעם אחת — אין lazy loading / virtualization
- ⚠️ depArrows מחושב ב-`useMemo` אבל בלי dependency על flatTasks changes → re-render מלא

---

## 12. Gaps & Recommendations (פערים והמלצות)

### פערים קריטיים
1. ❌ **אין phase templates ישראליים** — הוסף seed data עם 9 שלבים תקניים
2. ❌ **אין cycle detection** בתלויות — הוסף DFS check ב-POST `/project-task-dependencies`
3. ❌ **אין working calendar** — CPM סופר ימי שבת/חג כימי עבודה
4. ❌ **אין resource leveling** — שני משימות קריטיות יכולות להיות מוקצות לאותו עובד
5. ❌ **אין אינטגרציה** בין AI-Task-Manager ל-techno-kol-ops — שני עולמות נפרדים

### פערים בינוניים
6. ⚠️ **drag ב-Gantt לא מחיל cascade** — אם משימה A הוזזה, משימות תלויות לא נדחפות
7. ⚠️ **אין תמיכה ב-multi-baseline** — רק baseline אחד, אין היסטוריה
8. ⚠️ **milestones לא קשורות ל-CPM** — אבן דרך יכולה להיות "הושלמה" בעוד המשימות הקריטיות שלה פתוחות
9. ⚠️ **אין weather integration** — חשוב לפרויקטי בנייה בישראל
10. ⚠️ **אין הדגשת חגי ישראל** ב-Gantt (ר"ה, סוכות, פסח, יום העצמאות)

### שיפורים נחמדים לשימוש
11. 💡 Print-to-PDF ל-Gantt
12. 💡 mouse-wheel zoom
13. 💡 Task resize מעבר לדרג
14. 💡 Earned Value Management (EVM) — SPI/CPI
15. 💡 "What-if" scenarios
16. 💡 Monte Carlo integration (קיים engine ב-techno-kol-ops!)

---

## 13. File References (קבצים רלוונטיים)

### Core CPM/Gantt (AI-Task-Manager)
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\AI-Task-Manager\artifacts\api-server\src\routes\projects-module.ts` (652 שורות — API + CPM algorithm)
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\AI-Task-Manager\artifacts\erp-app\src\pages\projects\gantt-chart-page.tsx` (650+ שורות — SVG Gantt UI)
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\AI-Task-Manager\artifacts\erp-app\src\pages\projects\milestones-page.tsx` (ניהול אבני דרך)
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\AI-Task-Manager\artifacts\erp-app\src\pages\projects\projects-command-center.tsx` (portfolio view)
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\AI-Task-Manager\artifacts\erp-app\src\pages\projects\project-execution.tsx` (execution stages)
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\AI-Task-Manager\artifacts\api-server\src\routes\projects-sap-upgrade.ts` (SAP-style resources/budgets/risks)
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\AI-Task-Manager\artifacts\api-server\src\app.ts` (lines 929-1017 — schema definitions)

### techno-kol-ops (pipeline model)
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\techno-kol-ops\src\db\schema.sql` (lines 380-447 — projects, pipeline_events, approvals)
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\techno-kol-ops\src\services\pipeline.ts`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\techno-kol-ops\src\routes\pipeline.ts`

### Real-Estate sub-module (partial Israeli phases)
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\AI-Task-Manager\artifacts\erp-app\src\pages\projects\real-estate\contractors.tsx` (TRADES: שלד, גמר, חשמל...)
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\AI-Task-Manager\artifacts\erp-app\src\pages\projects\real-estate\permits.tsx` (PERMIT_TYPES: היתר חפירה...)
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\AI-Task-Manager\artifacts\erp-app\src\pages\projects\real-estate\units.tsx` (STATUSES: תכנון/בבנייה/גמר)

---

## 14. Verdict

| Dimension | Score | Note |
|---|---|---|
| Projects table | 8/10 | AI-TM עשירה; techno-kol מודל שונה |
| Tasks/Milestones | 9/10 | WBS + milestones + baseline |
| Gantt visualization | 8/10 | SVG מקצועי, חסר print/cycle-check |
| Critical Path (CPM) | 9/10 | אלגוריתם אמיתי ונכון; חסר calendar |
| Resource allocation | 6/10 | סכימה טובה, אין M:N עם tasks |
| Dependencies | 8/10 | 4 types + lag; אין cycle detection |
| Israeli phases | 3/10 | אין phase templates, רק טקסט חופשי |
| Cross-project integration | 2/10 | שני עולמות נפרדים |
| **Overall** | **6.6/10** | יסוד מוצק, פערים משמעותיים לשימוש בנייה ישראלי |

**Recommendation:** Merge worlds + add Israeli phase seed data + add calendar + cycle detection = 9/10 production-ready.

---

*QA Agent #146 — Static Analysis*
*Cross-project: AI-Task-Manager, techno-kol-ops, onyx-procurement*
*2026-04-11 | Hebrew/English bilingual*
