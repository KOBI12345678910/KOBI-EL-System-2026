# QA Agent #145 — Building Permits (היתרי בניה) Tracking

**Report Type:** Static Cross-Project QA
**Dimension:** Building Permits Tracking
**Date:** 2026-04-11
**Language:** Hebrew + Technical
**Scope:** Full workspace (`C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\`)

---

## 1. Executive Summary / תמצית מנהלים

מערכת מעקב היתרי הבנייה קיימת בצורה חלקית ולא אחידה ברחבי הפלטפורמה. המודול הראשי נמצא ב-`AI-Task-Manager` תחת `pages/projects/real-estate/permits.tsx`, ממופה ל-API בנתיב `/api/projects/permits` על טבלה `project_permits`. קיימים שדות `building_permit_number`, `building_permit_status`, `building_permit_date` ב-`projects_module` וב-`crm_opportunities`/`crm_leads`, אך אין אחידות סכמה בין המודולים, חסרה הפרדה מלאה בין "ועדה מקומית" ל"ועדה מחוזית", ואין שדה ייעודי לניהול קבצים (attachments) ב-`project_permits` עצמה.

---

## 2. Coverage Matrix / מטריצת כיסוי

| # | דרישה                                   | קיים? | איכות | קובץ מקור                                                                                          |
|---|------------------------------------------|-------|-------|------------------------------------------------------------------------------------------------------|
| 1 | Permit Number (מספר היתר)                | חלקי  | C     | `AI-Task-Manager/artifacts/erp-app/src/pages/projects/real-estate/permits.tsx`                       |
| 2 | Workflow Status (הוגש/אושר/דחוי)         | כן    | B+    | `AI-Task-Manager/artifacts/erp-app/src/pages/projects/real-estate/permits.tsx` (שורה 13)             |
| 3 | Expiry Tracking (תפוגה)                  | כן    | B     | `AI-Task-Manager/artifacts/erp-app/src/pages/projects/real-estate/permits.tsx` (שורה 122, 153)       |
| 4 | Document Attachments (מסמכים)            | חלקי  | D     | `AI-Task-Manager/artifacts/erp-app/src/pages/projects/real-estate/permits.tsx` (שורה 160, UI בלבד)   |
| 5 | Municipal Authority Links (רשות מאשרת)   | כן    | B     | `AI-Task-Manager/artifacts/erp-app/src/pages/projects/real-estate/permits.tsx` (שורה 149)            |
| 6 | ועדה מקומית/מחוזית                       | חלקי  | D     | `AI-Task-Manager/artifacts/erp-app/src/pages/projects/real-estate/permits.tsx` (שורה 149)            |

**ציון כולל:** C+ (65/100)

---

## 3. Detailed Findings

### 3.1 Permit Number Column — מספר היתר

**Status:** חלקי — קיים ב-schema רק של `projects_module`

**Found:**
- `projects_module.building_permit` (column #32, varchar, nullable)
- `projects_module.building_permit_number` (column #85, varchar, nullable)
- `projects_module.building_permit_date` (column #97, date, nullable)
- UI table column `מזהה` / `row.id` (ERP permits page)

**Missing:**
- ב-`project_permits` (הטבלה אליה נקשר `/api/projects/permits`) — אין שדה מפורש `permit_number` במפרט
- אין אכיפת ייחודיות (UNIQUE constraint) על מספר היתר
- אין וולידציה של פורמט מספר היתר (פורמט ישראלי: מספר מחוז/עיר/מספר רץ)
- קיימת כפילות מטרידה: `building_permit` וגם `building_permit_number` ב-`projects_module` — לא ברור איזה שדה הוא אמת

**Severity:** MEDIUM
**Recommendation:**
```sql
ALTER TABLE project_permits ADD COLUMN permit_number VARCHAR(64) UNIQUE;
CREATE INDEX idx_permits_number ON project_permits(permit_number);
-- Deprecate projects_module.building_permit, keep only building_permit_number
```

---

### 3.2 Permit Status Workflow — סטטוס היתר

**Status:** כן — מיושם ב-UI ב-6 מצבים

**Found** (`permits.tsx` שורה 13-14):
```typescript
const STATUSES = ["טיוטה", "הוגש", "בבדיקה", "מאושר", "נדחה", "תקף"] as const;
const SC: Record<string, string> = {
  "טיוטה":  "bg-gray-500/20 text-gray-300",
  "הוגש":    "bg-blue-500/20 text-blue-300",
  "בבדיקה":  "bg-yellow-500/20 text-yellow-300",
  "מאושר":   "bg-green-500/20 text-green-300",
  "נדחה":    "bg-red-500/20 text-red-300",
  "תקף":     "bg-emerald-500/20 text-emerald-300"
};
```

**Issues:**
- Workflow מיושם כ-enum בצד ה-client בלבד — אין enforcement ב-DB
- אין audit trail של שינויי סטטוס (רק UI mock של היסטוריה בשורה 182)
- אין state machine — אפשר לקפוץ מ"טיוטה" ל"מאושר" ללא "בבדיקה"
- אין automation — למשל, המעבר ל"תקף" לאחר approval לא חוזר לחשב `expiryDate`
- שדה `building_permit_status` ב-`projects_module` ו-`crm_opportunities` הוא `character varying` ללא CHECK constraint — אפשר להכניס כל ערך
- Mismatch: `crm_leads.building_permit_status` vs `project_permits.status` — שני מקורות אמת

**Severity:** HIGH
**Recommendation:**
```sql
ALTER TABLE project_permits
  ADD CONSTRAINT chk_permit_status
  CHECK (status IN ('טיוטה','הוגש','בבדיקה','מאושר','נדחה','תקף','פג תוקף','בערעור'));

CREATE TABLE project_permits_history (
  id SERIAL PRIMARY KEY,
  permit_id INTEGER REFERENCES project_permits(id),
  old_status VARCHAR(20),
  new_status VARCHAR(20),
  changed_by INTEGER,
  changed_at TIMESTAMPTZ DEFAULT NOW(),
  reason TEXT
);
```

יש גם להוסיף `trigger` שבודק חוקיות מעבר.

---

### 3.3 Expiry Tracking — מעקב תפוגה

**Status:** כן, בסיסי

**Found:**
- UI field: `תאריך תפוגה` (שורה 153)
- Table column: `תפוגה` (שורה 107, 122): `{new Date(row.expiryDate).toLocaleDateString("he-IL")}`
- Detail modal: שדה `תפוגה` (שורה 175)
- כרטיס סטטיסטי "תקפים" (שורה 86) — נספרים היתרים ב-status "תקף"

**Missing:**
- **אין התרעות expiry** — לא נמצא job/cron/notification-service שמזהיר 30/60/90 יום לפני תפוגה
- **אין renewal workflow** — אין מושג של חידוש היתר; פג תוקף → יש ליצור חדש ידנית
- **אין dashboard** ייעודי "היתרים שיפוגו בקרוב"
- אין `notification-service.ts` trigger על permits (קיים רק על inventory shelf life)
- לוגיקת expiry-countdown קיימת ב-`ehs/environmental-permits.tsx` אך לא במודול הראשי של projects/permits
- אין שמירה של תאריכי `issued_date`, `approved_at`, `renewal_required_date` נפרדים

**Severity:** HIGH — רגולטורית קריטית לבנייה בישראל
**Recommendation:** צריך:
1. Cron שמריץ שאילתה יומית `WHERE expiry_date < NOW() + INTERVAL '60 days'`
2. שליחת WhatsApp/Email ל-`responsible` + `architect_name`
3. Dashboard card "היתרים פגי תוקף תוך 30 יום"
4. Auto-transition של סטטוס ל"פג תוקף" כש-`expiry_date < NOW()`

---

### 3.4 Document Attachments — מסמכים מצורפים

**Status:** חלקי — UI בלבד, ללא backend

**Found** (`permits.tsx` שורה 160):
```tsx
<div className="col-span-3">
  <Label className="text-muted-foreground text-xs">מסמכים</Label>
  <div className="border-2 border-dashed border-border rounded-lg p-6 text-center mt-1">
    <Upload className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
    <p className="text-sm text-muted-foreground">גרור קבצים או לחץ</p>
  </div>
</div>
```

**Critical Gaps:**
- ה-UI מראה drag-drop, אך **אין handler** — אין `onChange`, אין `onDrop`, אין API call
- אין שדה `documents` / `attachments` / `file_urls` בסכמת `project_permits`
- `projects_module` אכן כולל `documents_url TEXT` (שורה 79 במפרט) אבל הוא text חופשי, לא מערך, ללא metadata (filename, size, uploader, timestamp)
- אין גישה ל-storage layer (S3/local) דרך רישום היתרים
- שורה 162 אומרת "הערות" + "מסמכים" אבל handleSave (שורה 50-61) שולח רק `form` state — הוא לא קולט קבצים
- `duplicate-record.ts` לא משכפל מסמכים
- אין version control של גרסאות מסמכים (חיוני לבנייה — גרמושקה, תיאום מתכנני חוץ, וכו')

**Severity:** CRITICAL
**Recommendation:**
```sql
CREATE TABLE project_permits_attachments (
  id SERIAL PRIMARY KEY,
  permit_id INTEGER NOT NULL REFERENCES project_permits(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_size INTEGER,
  mime_type VARCHAR(128),
  document_type VARCHAR(50), -- 'גרמושקה', 'תוכנית אדריכלית', 'כתב כמויות', 'חישוב סטטי'
  version INTEGER DEFAULT 1,
  uploaded_by INTEGER,
  uploaded_at TIMESTAMPTZ DEFAULT NOW(),
  is_current BOOLEAN DEFAULT TRUE
);
```

מימוש ב-UI: שימוש ב-`multer` upload middleware כמו ב-`contracts.ts` (שורה 217 משתמשת ב-`attachmentData`).

---

### 3.5 Municipal Authority Links — קישור לרשות

**Status:** כן, כשדה טקסט

**Found** (`permits.tsx` שורה 149):
```tsx
<select>
  <option>בחר...</option>
  <option>עירייה</option>
  <option>רשות הכבאות</option>
  <option>המשרד להגנת הסביבה</option>
  <option>משרד הבריאות</option>
  <option>ועדה מקומית</option>
</select>
```

- Column `רשות` בטבלה (שורה 105, 120): `row.authority`
- Detail modal מראה `dr.authority` (שורה 172)

**Issues:**
- אין טבלת `municipal_authorities` נורמליזטיבית — הרשות נשמרת כ-free text
- אין קישור ל-GIS / לאתר הרשות המקומית
- אין שמירה של פרטי airport (email, phone, address, portal URL) של הרשות
- אין אפשרות לקשר רשימת לרשויות רבות — היתר אחד יכול לדרוש 3-4 אישורים מקבילים
- אין integration עם "רישוי זמין" (portal ממשלתי `licensing.gov.il`)
- אין "Deep link" לאתר הרשות הרלוונטית לצורך בדיקת סטטוס
- Schema-level: `project_permits` כנראה שומרת רק string — ראו `authority` ב-`permits.tsx` שורה 120

**Severity:** MEDIUM
**Recommendation:**
```sql
CREATE TABLE municipal_authorities (
  id SERIAL PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  name_he VARCHAR(200),
  authority_type VARCHAR(50), -- 'עירייה','ועדה מקומית','ועדה מחוזית','משרד ממשלתי'
  portal_url TEXT,
  contact_email VARCHAR(200),
  contact_phone VARCHAR(50),
  address TEXT,
  gis_link TEXT,
  active BOOLEAN DEFAULT TRUE
);

ALTER TABLE project_permits
  ADD COLUMN authority_id INTEGER REFERENCES municipal_authorities(id);
```

---

### 3.6 ועדה מקומית / ועדה מחוזית

**Status:** חלקי (חסר משמעותית)

**Found:**
- שורה 149: האפשרות "ועדה מקומית" קיימת כ-`<option>` בodropdown
- **"ועדה מחוזית" — לא קיימת כלל** בקובץ permits.tsx או בכל קובץ אחר ב-workspace
- אין הפרדה סכמטית בין סוגי ועדות

**Critical Gaps:**
- בחוק התכנון והבנייה הישראלי (תשכ"ה-1965) — יש הבחנה פורמלית בין:
  1. רשות רישוי (מהנדס העיר)
  2. ועדה מקומית לתכנון ובנייה
  3. ועדה מחוזית לתכנון ובנייה
  4. המועצה הארצית
  - המערכת לא מבחינה ביניהן
- אין workflow של "הקלות" / "שימוש חורג" — דורש ועדה מחוזית
- אין שדה `hearing_date` / `decision_number` / `plan_number` (תב"ע)
- אין קישור לרישומי תב"ע פעילות
- `construction_stage` (עמודה 104 ב-`crm_leads`) קיים כ-string חופשי

**Severity:** HIGH — רגולטורית
**Recommendation:**
```sql
ALTER TABLE project_permits ADD COLUMN committee_type VARCHAR(20);
-- 'רישוי','ועדה מקומית','ועדה מחוזית','מועצה ארצית'

ALTER TABLE project_permits ADD COLUMN plan_number VARCHAR(50); -- תב"ע
ALTER TABLE project_permits ADD COLUMN hearing_date DATE;
ALTER TABLE project_permits ADD COLUMN decision_number VARCHAR(50);
ALTER TABLE project_permits ADD COLUMN variance_type VARCHAR(50);
-- 'הקלה','שימוש חורג','תוספת אחוזי בנייה','שינוי תב"ע'
```

---

## 4. Cross-Project Findings

### 4.1 Duplicate Concerns Across Modules

| מודול                              | שדה                              | כיסוי |
|-------------------------------------|-----------------------------------|-------|
| `project_permits`                   | `status`, `authority`, `expiryDate` (UI) | בסיסי |
| `projects_module.building_permit`   | varchar flag                      | ישן   |
| `projects_module.building_permit_number` | varchar                      | חדש   |
| `projects_module.building_permit_date` | date                           | יחיד  |
| `crm_leads.building_permit_status`  | varchar                           | lead  |
| `crm_opportunities.building_permit_status` | varchar                    | opportunity |
| `hse_work_permits`                  | שונה לחלוטין (היתר עבודה, לא בנייה) | נפרד |
| `cmms_work_permits`                 | היתר תחזוקה — גם שונה             | נפרד  |

**Observation:** 4 מודולים נפרדים עם שם דומה אבל semantics שונים לחלוטין. אין ontology מרכזי.

### 4.2 API Route Integrity

- `/api/projects/permits` → `project_permits` (דרך `sqWithStats` ב-`module-path-aliases.ts:751`)
- Entity registry: `"project-permits": { table: "project_permits", orderBy: "created_at DESC NULLS LAST" }` (`entity-crud-registry.ts:224`)
- אין middleware auth ייחודי ל-permits — משתמש ב-generic CRUD
- אין rate limiting ספציפי
- אין webhook ל"רישוי זמין" או לרשות מקומית

### 4.3 Missing End-to-End Flow

קיימים גם מודולים פריפריאליים:
- `pages/ehs/work-permits.tsx` — היתרי עבודה (hot work), לא בנייה
- `pages/ehs/environmental-permits.tsx` — היתרים סביבתיים
- הבחנה ברורה קיימת, אך אין קישור ביניהם. לדוגמה: אם פרויקט בנייה דורש גם היתר סביבתי, אין עצם אחד שמרכז את כל ההיתרים הנדרשים לפרויקט.

---

## 5. Severity Summary

| חומרה      | כמות | פריטים                                                                            |
|-------------|------|------------------------------------------------------------------------------------|
| CRITICAL    | 1    | Attachments backend missing (3.4)                                                  |
| HIGH        | 3    | Status workflow enforcement (3.2), Expiry notifications (3.3), ועדות (3.6)         |
| MEDIUM      | 2    | Permit number uniqueness (3.1), Authority normalization (3.5)                      |
| LOW         | 1    | Audit history UI vs backend mismatch (3.2)                                         |

---

## 6. Recommendation Priority

1. **P0:** בניית `project_permits_attachments` עם upload backend (3.4)
2. **P0:** Cron ל-expiry tracking + notification (3.3)
3. **P1:** CHECK constraint על status + טבלת היסטוריה (3.2)
4. **P1:** שדות `committee_type`, `plan_number`, `hearing_date` (3.6)
5. **P2:** טבלת `municipal_authorities` נורמליזטיבית (3.5)
6. **P2:** UNIQUE constraint על `permit_number` + פתרון כפילות `building_permit` vs `building_permit_number` (3.1)

---

## 7. Source Files Examined

| קובץ                                                                                                   | רלוונטיות |
|---------------------------------------------------------------------------------------------------------|-----------|
| `AI-Task-Manager/artifacts/erp-app/src/pages/projects/real-estate/permits.tsx`                          | ★★★★★     |
| `AI-Task-Manager/artifacts/api-server/src/routes/module-path-aliases.ts:751`                            | ★★★★      |
| `AI-Task-Manager/artifacts/api-server/src/routes/entity-crud-registry.ts:224`                           | ★★★★      |
| `AI-Task-Manager/artifacts/erp-app/ERP_FULL_SPECIFICATION.md:11592,11743,12707,12760,12772`            | ★★★★      |
| `AI-Task-Manager/artifacts/erp-app/src/pages/ehs/environmental-permits.tsx`                             | ★★★       |
| `AI-Task-Manager/artifacts/erp-app/src/pages/ehs/work-permits.tsx`                                      | ★★        |
| `AI-Task-Manager/artifacts/api-server/src/routes/cmms.ts:1360-1799`                                     | ★★        |
| `AI-Task-Manager/artifacts/api-server/src/migrations/task269_hse_chemical_permits_emergency.sql`        | ★★        |

---

**QA Agent #145 — End of Report**
