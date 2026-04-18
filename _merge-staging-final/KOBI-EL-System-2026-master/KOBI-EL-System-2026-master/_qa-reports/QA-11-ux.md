# QA-11 — UX / Usability Audit

**Agent:** QA-11 (UX/Usability)
**Owner:** ERP טכנו-קול עוזי
**Date:** 2026-04-11
**Scope:** כל הקליינטים של המערכת
**Methodology:** סקירה סטטית של קבצי UI (React/TSX/JSX) לפי 14 קריטריוני UX.
**Scale:** 1 = גרוע · 2 = חלש · 3 = סביר · 4 = טוב · 5 = מצוין

---

## 0. Scope & Clients Audited

| # | Client | Path | Type | Screens Audited |
|---|--------|------|------|-----------------|
| A | Payroll Autonomous | `payroll-autonomous/src/App.jsx` | React SPA (Dark, RTL) | 5 טאבים |
| B | Techno-Kol Ops | `techno-kol-ops/client/src/` | React + Router (Dark, RTL) | 25 עמודי עבודה |
| C | Onyx Procurement Web | `onyx-procurement/web/*.jsx` | 4 דשבורדים נפרדים | 4 apps |

**Out of scope:** `enterprise_palantir_core` (FastAPI — ללא UI), `GPS-Connect` (SDK library), `nexus_engine` (backend engine).

---

## 1. Criteria Legend (14)

| # | Criterion |
|---|-----------|
| C1 | כותרת + תיאור ברורים |
| C2 | עומס מידע (7±2) |
| C3 | Primary CTA מובחן |
| C4 | זרימה (RTL) |
| C5 | הודעות שגיאה ברורות בעברית + Next-Step |
| C6 | Confirmation על פעולות הרסניות |
| C7 | Breadcrumbs |
| C8 | Back button |
| C9 | Feedback מיידי (toast/spinner) |
| C10 | Keyboard shortcuts |
| C11 | Form state persistence |
| C12 | Help text / tooltips |
| C13 | Preview חישוב לפני submit |
| C14 | Dashboard KPIs למעלה |

---

## A. Payroll Autonomous — `payroll-autonomous/src/App.jsx`

ה־UI מרוכז בקובץ יחיד (App.jsx, ~480 שורות) עם 5 טאבים. RTL, theme חשוך, העיצוב מינימלי ופונקציונלי.

### A.1 דשבורד (Dashboard Tab)

**Path:** `App.jsx:105-128` (`DashboardTab`)
**תיאור:** ארבעה KPI cards — עובדים פעילים, תלושים החודש, ברוטו/נטו חודשי.

| Criterion | Score | Finding |
|-----------|:---:|---------|
| C1 — כותרת + תיאור | 3 | יש כותרת דף־רמה ("Payroll Autonomous — שכר אוטונומי") אך הטאב עצמו חסר כותרת משנית + תיאור. המשתמש רואה רק 4 מספרים גדולים ללא הסבר מה הם מודדים. |
| C2 — עומס מידע | 5 | רק 4 stat cards — מצוין, מתחת ל־7±2. |
| C3 — Primary CTA | 1 | **אין** CTA בדשבורד כלל. למשתמש אין הכוונה מה לעשות הלאה (לחץ "חשב תלוש חדש" היה צריך להופיע כאן). |
| C4 — RTL flow | 5 | RTL שלם על `body`; padding/margin צמודים נכון. |
| C5 — הודעות שגיאה | 3 | `error-banner` ברמת אפליקציה — טקסט השגיאה עובר as-is מ־API. לא בהכרח מתורגם; לא מציין next-step. |
| C6 — Confirmation | N/A | אין פעולות הרסניות בדשבורד. |
| C7 — Breadcrumbs | 1 | אין. |
| C8 — Back button | 1 | אין (אין היסטוריה בין טאבים; טאב = state ב־React, לא URL). כשחוזרים מ־compute tab אין דרך "חזרה". |
| C9 — Feedback מיידי | 3 | טעינה ראשונית ללא skeleton/spinner — המסך ריק עד ש־`loadAll` חוזר. |
| C10 — Keyboard | 1 | אין shortcuts כלל (Tab → 1/2/3, Esc לסגירת מודל, Ctrl+S לשמור — כלום). |
| C11 — State persistence | N/A | אין טופס. |
| C12 — Help/tooltips | 1 | אין tooltip על אף KPI. "ברוטו חודשי" — ברוטו של מה? רק של החודש הנוכחי? |
| C13 — Preview | N/A | — |
| C14 — KPIs למעלה | 4 | ה־KPIs למעלה, אבל חסרים קריטיים — אזהרות קומפליאנס (טופס 101 חסר, עובדים שלא הוגש להם תלוש), רזרבת תזרים לשכר. |

**Average:** 2.4 / 5

**Top Findings:**
- BUG-UX-A01 (HIGH): אין CTA — המשתמש מגיע לדשבורד ולא יודע מה הצעד הבא. הוסף "+ חישוב תלוש חדש" ו־"ראה תלושים החודש" מתחת ל־stat cards.
- BUG-UX-A02 (MED): KPIs ללא tooltip — "ברוטו חודשי" לא מציין scope (חודש נוכחי? YTD?). הוסף title או ℹ icon.
- BUG-UX-A03 (MED): אין התראות קומפליאנס — טופס 101/126/סיום יחסי חסר → no visibility.

### A.2 תלושי שכר (WageSlipsTab)

**Path:** `App.jsx:130-160`
**תיאור:** טבלה של כל התלושים + כפתורי פעולה על שורה.

| C | Score | Finding |
|---|:---:|---------|
| C1 | 4 | "תלושי שכר (N)" — ברור. חסר הסבר על סטטוסים (draft/computed/approved/issued/voided). |
| C2 | 4 | 8 עמודות — על הגבול. ת.ז + עובד אפשר לאחד. |
| C3 | 4 | "אשר" ו־"הנפק PDF" עם class `primary` (כחול) — מובחנים ויזואלית. |
| C4 | 5 | RTL תקין; `text-align: right` בעמודות. |
| C5 | 3 | `setError(err.message)` — אין תרגום וclassification. |
| C6 | **1** | **BUG-UX-A04 (CRITICAL): "הנפק PDF" פעולה בלתי הפיכה — מדפיסה תלוש למס הכנסה/עובד, חותמת קומפליאנס — ללא `confirm()` כלל. לחיצה שגויה = PDF שגוי מונפק.** |
| C7 | 1 | אין. |
| C8 | 3 | Tab metaphor — אפשר לעבור טאב אחר, לא "back". |
| C9 | 2 | לחצני פעולה לא מראים loading state; אפשר ללחוץ פעמיים ולכפל הנפקה. |
| C10 | 1 | אין. |
| C11 | N/A | — |
| C12 | 1 | אין tooltip על סטטוסים. מה זה "voided"? "computed"? |
| C13 | **2** | כפתור "צפה" פותח `alert()` עם 2 שורות — לא preview אמיתי של התלוש. רק לפני save בטאב compute יש preview. **התלוש הרגיש בזמן אישור לא נראה בבירור.** |
| C14 | N/A | — |

**Average:** 2.5 / 5

**Top Findings:**
- BUG-UX-A04 (CRITICAL): חסר confirmation על "הנפק PDF" ועל "אשר".
- BUG-UX-A05 (HIGH): `onView` → `alert()` (שורה 446-448). הפעולה "צפה" היא חובה ב־UX של payroll — חייבת modal מלא עם כל הפירוט.
- BUG-UX-A06 (MED): לחצני פעולה ללא `disabled={loading}` → double-submit סביר.

### A.3 חישוב תלוש חדש (ComputeTab)

**Path:** `App.jsx:162-249`
**תיאור:** טופס שעות/תוספות + פאנל תצוגה מקדימה.

| C | Score | Finding |
|---|:---:|---------|
| C1 | 4 | "חישוב תלוש חדש" ברור. חסר subtitle עם scope (עבור איזה עובד/חודש). |
| C2 | **2** | **BUG-UX-A07 (HIGH): 17 שדות בטופס אחד (שעות רגילות + 4 נוספות + חופש/מחלה + בונוסים + עמלות + 4 תוספות).** מעל 7±2, צריך להתחלק לsections collapsed או wizard. |
| C3 | 4 | "שמור תלוש" class primary — מובחן. "חשב תצוגה מקדימה" משני. |
| C4 | 5 | RTL מושלם; grid 2/3 עמודות מתפקד. |
| C5 | 3 | שגיאה מוצגת ב־`error-banner` אבל עדיין עם טקסט API גולמי. |
| C6 | 4 | Preview קיים — זה ה־confirmation המקצועי הכי קריטי לפעולה הזו. |
| C7 | 1 | אין. |
| C8 | 2 | ביטול = `setPreview(null)` — לא מנקה את הטופס; אם המשתמש ילחץ על tab אחר — הנתונים הולכים לאיבוד. |
| C9 | 3 | `loading` state יש; spinner מפורש — לא. |
| C10 | **1** | **BUG-UX-A08 (MED): אין Tab־to־next־field ברצף הגיוני, אין Ctrl+Enter לחישוב, אין Ctrl+S לשמור.** |
| C11 | **1** | **BUG-UX-A09 (HIGH): אם המשתמש לוחץ tab אחר או מרענן — כל הנתונים נעלמים. 17 שדות = ~5 דק' עבודה לאיבוד.** |
| C12 | **1** | **BUG-UX-A10 (HIGH): אין tooltip על נקודות זיכוי, שכר בסיס, hours_regular = 182.** משתמש לא HR לא יודע מה לכתוב. |
| C13 | 5 | **Preview מצוין** — מראה ברוטו → ניכויים → נטו בצורה ברורה (לוח תלוש מדומה). זה החלק הכי טוב ב־UX. |
| C14 | N/A | — |

**Average:** 2.8 / 5 (ה־Preview מציל את הציון)

**Top Findings:**
- BUG-UX-A07 (HIGH): טופס ארוך בלי sections — פצל ל־accordion: "תקופה" / "שעות" / "תוספות".
- BUG-UX-A09 (HIGH): אין localStorage persistence לטופס ה־compute. 17 שדות בסיכון תמידי.
- BUG-UX-A10 (HIGH): חסר tooltips על שדות טכניים/חוקיים.
- POSITIVE: Preview של התלוש = best-practice; חשוב לשמור אותו ולאפס ממנו.

### A.4 עובדים (EmployeesTab)

**Path:** `App.jsx:283-358`

| C | Score | Finding |
|---|:---:|---------|
| C1 | 4 | "עובדים (N)" + "+ עובד חדש" ברור. |
| C2 | **2** | **BUG-UX-A11 (HIGH): 13 שדות בטופס עובד חדש** — מעסיק, מס' עובד, ת.ז, שם פרטי, משפחה, תאריך, סוג העסקה, שכר בסיס, שעות חודש, אחוז משרה, נק' זיכוי, תפקיד, מחלקה. אין קיבוץ, אין wizard. |
| C3 | 4 | "שמור" primary — ברור. |
| C4 | 5 | RTL. |
| C5 | 3 | error-banner, עדיין לא ידידותי. אין validation client-side על ת.ז (אלגוריתם ישראלי), שם, ח.פ. |
| C6 | 5 | + עובד חדש → `setShowForm(!showForm)` — toggle, לא מחיקה. אין פעולה הרסנית כרגע. |
| C7 | 1 | אין. |
| C8 | 3 | "ביטול" יש. |
| C9 | 2 | אין loading state בלחיצה על "שמור". אם API איטי — משתמש לוחץ 3 פעמים. |
| C10 | 1 | אין. |
| C11 | **1** | **BUG-UX-A12 (HIGH): פתיחת הטופס מאפסת state; ביטול = אובדן נתונים ללא אזהרה.** |
| C12 | **1** | **BUG-UX-A13 (HIGH): "נקודות זיכוי" default 2.25 — אין הסבר למה.** "שעות/חודש" default 182 — למה? תקן ישראלי אבל בלתי מובן למשתמש חדש. |
| C13 | 1 | אין preview של מה שישמר (למשל — "שכר נטו מוערך: ..."). |
| C14 | N/A | — |

**Average:** 2.6 / 5

**Top Findings:**
- BUG-UX-A11 (HIGH): פצל טופס עובד חדש ל־3 sections (זיהוי / עבודה / שכר ומיסוי).
- BUG-UX-A13 (HIGH): הוסף tooltip + link למידע רשות המסים על "נקודות זיכוי".

### A.5 מעסיקים (EmployersTab)

**Path:** `App.jsx:360-413`

| C | Score | Finding |
|---|:---:|---------|
| C1 | 4 | ברור. |
| C2 | 4 | 7 שדות — על הגבול אך סביר. |
| C3 | 4 | Primary ברור. |
| C4 | 5 | RTL. |
| C5 | **2** | **BUG-UX-A14 (HIGH): אין validation על ח.פ ישראלי (9 ספרות + check-digit). משלב לכמה API קריטיים בהמשך.** |
| C6 | 5 | — |
| C7 | 1 | אין. |
| C8 | 3 | "ביטול" יש. |
| C9 | 2 | חסר spinner/disabled בשמירה. |
| C10 | 1 | אין. |
| C11 | 1 | אין persistence. |
| C12 | 2 | חסר הסבר מה זה "תיק ניכויים". |
| C13 | 1 | — |
| C14 | N/A | — |

**Average:** 2.8 / 5

---

## B. Techno-Kol Ops — `techno-kol-ops/client/src/`

SPA עם React Router, 25 עמודי עבודה, Sidebar + Navbar. Theme חשוך, RTL מלא, אייקונים אמוג'י.

### B.1 Dashboard — `pages/Dashboard.tsx`

**תיאור:** KPI strip (5), orders table (LIVE), alerts feed, 3 charts (bar, pie, line).

| C | Score | Finding |
|---|:---:|---------|
| C1 | **2** | **BUG-UX-B01 (MED): אין h1/title — רק `MetricCard`-ים.** דף הבית ללא "דשבורד מרכזי" + תיאור מה עושים פה. |
| C2 | 3 | 5 KPIs + טבלה + 3 גרפים = קבוצות 9+ — אבל מחולקים לקבוצות, סביר. |
| C3 | 2 | **BUG-UX-B02 (MED): אין CTA מרכזי — משתמש חדש לא יודע מה הלאה.** למרות שיש קישורים (onClick על MetricCard) — הם לא ברורים ויזואלית כ־CTA. |
| C4 | 5 | RTL, margin-right לסייד־בר. |
| C5 | 3 | API errors → `useApi` hook, הצגה לא עקבית. |
| C6 | N/A | — |
| C7 | **1** | **BUG-UX-B03 (MED): אין breadcrumbs בשום מקום ב־techno-kol. 25 עמודים עם היררכיה — אין navigation aid.** |
| C8 | 2 | Browser back עובד, אבל אין back button ייעודי. |
| C9 | 2 | **BUG-UX-B04 (MED): Loading יחיד — "טוען נתונים..." טקסט פשוט; אין skeleton screens.** |
| C10 | 1 | אין. |
| C11 | N/A | — |
| C12 | 2 | Tooltip של Recharts בלבד; MetricCards אין title. |
| C13 | N/A | — |
| C14 | 4 | KPIs למעלה — OK. חסרים KPIs חוזיים (orders late, cash coming week). |

**Average:** 2.6 / 5

### B.2 WorkOrders — `pages/WorkOrders.tsx`

**תיאור:** AgGrid + side panel + new order modal.

| C | Score | Finding |
|---|:---:|---------|
| C1 | 4 | "הזמנות עבודה" ברור + חיפוש + CTA. חסר subtitle מה אפשר לעשות. |
| C2 | 4 | 7 עמודות grid — סביר. |
| C3 | 4 | "+ הזמנה חדשה" מובחן (orange border). |
| C4 | 5 | RTL. |
| C5 | 2 | אין handling שגיאות בשליחת הזמנה — שגיאה תשתוק. |
| C6 | **1** | **BUG-UX-B05 (HIGH): "עדכן התקדמות" = range slider; כל שינוי מיידי PUT — ללא confirmation. הזחה ב־±5% של progress = אין דרך חזרה.** |
| C7 | 1 | אין. |
| C8 | 3 | side panel × לסגירה. |
| C9 | 3 | Drag/range טוב; אין toast אחרי save. |
| C10 | 2 | Esc לא סוגר modal/panel (בדוק בקוד — אין `onKeyDown`). |
| C11 | **1** | **BUG-UX-B06 (HIGH): טופס הזמנה חדשה (8 שדות) — רענון/ביטול = אובדן.** |
| C12 | 2 | `placeholder="מעקות נירוסטה..."` יש על שם מוצר. חסר על "שווי", "מקדמה". |
| C13 | 2 | אין preview של ההזמנה לפני שמירה; בפרט — חישוב יתרה אחרי מקדמה. |
| C14 | N/A | — |

**Average:** 2.8 / 5

**Top Findings:**
- BUG-UX-B05 (HIGH): range slider הופך כל תנועה ל־PUT ללא debounce/confirm.
- BUG-UX-B06 (HIGH): NewOrderModal ללא persistence.

### B.3 ProductionFloor — `pages/ProductionFloor.tsx`

**תיאור:** Kanban drag-and-drop — 5 עמודות (pending→delivered).

| C | Score | Finding |
|---|:---:|---------|
| C1 | 4 | כותרת + hint "גרור הזמנות...". |
| C2 | 5 | 5 עמודות בלבד. |
| C3 | N/A | אין CTA (פעולה = drag). |
| C4 | 5 | RTL. |
| C5 | 2 | drop fail ללא UI feedback. |
| C6 | **1** | **BUG-UX-B07 (HIGH): drag→drop ללא אישור.** גרירה שגויה מ־"ייצור" ל־"נמסר" = אבד ולא מדווח לאף אחד (חסרה היסטוריה). |
| C7 | 1 | אין. |
| C8 | 2 | — |
| C9 | 2 | אין animation על drop. |
| C10 | 1 | אין Ctrl+Z. |
| C11 | N/A | — |
| C12 | 3 | hint ברור בלבד. |
| C13 | 1 | אין. |
| C14 | N/A | — |

**Average:** 2.4 / 5

**Top Findings:**
- BUG-UX-B07 (HIGH): Kanban ללא undo/confirm.

### B.4 Employees — `pages/Employees.tsx`

**תיאור:** טבלת עובדים + 4 metric cards + "+ עובד חדש" (**לא פונקציונלי!**).

| C | Score | Finding |
|---|:---:|---------|
| C1 | 4 | "עובדים" + "N/M נוכחים" ברור. |
| C2 | 5 | 7 עמודות, 4 cards. |
| C3 | **2** | **BUG-UX-B08 (CRITICAL): "+ עובד חדש" button ללא `onClick` — dead button (שורה 22).** |
| C4 | 5 | RTL. |
| C5 | 1 | אין. |
| C6 | N/A | — |
| C7 | 1 | אין. |
| C8 | 1 | אין. |
| C9 | 1 | אין. |
| C10 | 1 | אין. |
| C11 | N/A | — |
| C12 | 2 | Legend `LOC_LABEL` ברור אבל בלי tooltip. |
| C13 | N/A | — |
| C14 | 4 | KPIs למעלה. |

**Average:** 2.5 / 5

### B.5 Clients — `pages/Clients.tsx`

**תיאור:** טבלת לקוחות + "+ לקוח חדש" (גם הוא dead button).

| C | Score | Finding |
|---|:---:|---------|
| C1 | 4 | "לקוחות" ברור. חסר count. |
| C2 | 5 | 7 עמודות. |
| C3 | **2** | **BUG-UX-B09 (CRITICAL): "+ לקוח חדש" ללא onClick.** |
| C4 | 5 | RTL. |
| C5 | 1 | אין. |
| C6 | N/A | — |
| C7 | 1 | אין. |
| C8 | 1 | אין row → detail panel. Clients הם אובייקט ראשי במערכת — אין drill-down. |
| C9 | 1 | — |
| C10 | 1 | — |
| C11 | N/A | — |
| C12 | 2 | — |
| C13 | N/A | — |
| C14 | N/A | — |

**Average:** 2.3 / 5

### B.6 Materials — `pages/Materials.tsx`

| C | Score | Finding |
|---|:---:|---------|
| C1 | 4 | "מחסן וחומרי גלם" + banner "⚠ N פריטים מתחת לסף". |
| C2 | 4 | 6 category tabs + 4 metrics + טבלה. |
| C3 | 4 | "+ קבלת סחורה" מובחן. |
| C4 | 5 | RTL. |
| C5 | 2 | — |
| C6 | 3 | "קבלת סחורה" לא מגדירה תנועה הרסנית — סביר ללא confirm. |
| C7 | 1 | — |
| C8 | 3 | — |
| C9 | 2 | — |
| C10 | 1 | — |
| C11 | 1 | — |
| C12 | 3 | Progress bars צבעוניים — מוסיפים context ויזואלי. |
| C13 | 2 | — |
| C14 | 4 | Alerts banner בולט. |

**Average:** 2.9 / 5

### B.7 Finance — `pages/Finance.tsx`

| C | Score | Finding |
|---|:---:|---------|
| C1 | 3 | "פיננסים ורווחיות" — חסר תיאור scope (תקופה? company-level?). |
| C2 | 3 | 5 KPIs + 2 panels + transactions — על הגבול. |
| C3 | 2 | אין CTA — "דוח חודשי", "ייצוא", "הגשת מע"מ" — חסרים. |
| C4 | 5 | RTL. |
| C5 | 2 | — |
| C6 | N/A | — |
| C7 | 1 | — |
| C8 | 3 | — |
| C9 | 2 | — |
| C10 | 1 | — |
| C11 | N/A | — |
| C12 | **2** | **BUG-UX-B10 (MED): "רווח גולמי" חושב בחסר — (rev − materials − salary) / rev. לא כולל שעות נוספות, בונוסים, עלויות תפעוליות. חסר tooltip "בהגדרה זו".** |
| C13 | N/A | — |
| C14 | 4 | KPIs למעלה. חסר "מע"מ לתשלום", "מזומן בבנק". |

**Average:** 2.6 / 5

### B.8 AlertCenter — `pages/AlertCenter.tsx`

| C | Score | Finding |
|---|:---:|---------|
| C1 | 4 | "מרכז התראות" + count פתוחות. |
| C2 | 5 | פתוחות/סגורות. |
| C3 | 4 | "✓ סגור" ברור ירוק. |
| C4 | 5 | RTL. |
| C5 | 2 | — |
| C6 | **1** | **BUG-UX-B11 (MED): "✓ סגור" — סגירת התראה = פעולה קבועה ברישום הציות. ללא confirmation.** |
| C7 | 1 | — |
| C8 | 3 | — |
| C9 | 2 | — |
| C10 | 1 | — |
| C11 | N/A | — |
| C12 | 2 | — |
| C13 | N/A | — |
| C14 | 4 | — |

**Average:** 2.8 / 5

### B.9 Pipeline — `pages/Pipeline.tsx`

**תיאור:** 20 שלבים (deal→closed). Bar chart לכל שלב. Modal לפרוייקט חדש + detail panel.

| C | Score | Finding |
|---|:---:|---------|
| C1 | 4 | "שרשרת אספקה" + "SUPPLY CHAIN PIPELINE". |
| C2 | **2** | **BUG-UX-B12 (HIGH): 20 שלבים באותו מסך — גם עם bar chart קטן, הראייה של 20 labels = עומס קוגניטיבי.** |
| C3 | 4 | "+ פרוייקט חדש" מובחן. |
| C4 | 5 | RTL. |
| C5 | 2 | — |
| C6 | 3 | `handleAdvance` לא הפיך — אין confirm על "העברה לשלב הבא". |
| C7 | 1 | — |
| C8 | 3 | — |
| C9 | 3 | `advancing` state קיים. |
| C10 | 1 | — |
| C11 | 1 | — |
| C12 | 2 | — |
| C13 | 1 | — |
| C14 | N/A | — |

**Average:** 2.5 / 5

### B.10 Documents & Signatures — `pages/Documents.tsx`

| C | Score | Finding |
|---|:---:|---------|
| C1 | 5 | "מסמכים וחתימות" + subtitle אנגלי. |
| C2 | 4 | 3 filter buttons + table. |
| C3 | 4 | "+ חוזה לקוח" / "+ חוזה עובד" / "+ NDA" צבעים שונים — טוב ל־affordance. |
| C4 | 5 | RTL. |
| C5 | 2 | `alert('תזכורת נשלחה')` = feedback דל. |
| C6 | **1** | **BUG-UX-B13 (HIGH): "sendDoc" שולח חוזה לחתימה ללא confirmation. שליחת חוזה שגוי = confusion משפטי.** |
| C7 | 1 | — |
| C8 | 3 | — |
| C9 | 2 | alert() במקום toast. |
| C10 | 1 | — |
| C11 | 1 | — |
| C12 | 2 | — |
| C13 | 2 | אין preview של המסמך לפני שליחה (רק `viewSigned` אחרי חתימה). |
| C14 | N/A | — |

**Average:** 2.8 / 5

### B.11 SignaturePage — `pages/SignaturePage.tsx`

**תיאור:** public signing page (ללא לוגין).

| C | Score | Finding |
|---|:---:|---------|
| C1 | 5 | מוגדר ברור — חתימה על מסמך X. |
| C2 | 5 | מעט אלמנטים — canvas + שם + submit. |
| C3 | 4 | "חתום" primary. |
| C4 | 5 | RTL. |
| C5 | 3 | שגיאות → `alert()`. Hebrew. |
| C6 | 4 | יש 2־step flow (view → sign) — אפקטיבי כ־confirmation. |
| C7 | N/A | — |
| C8 | 2 | אין "חזרה לצפייה" אחרי מעבר ל־sign. |
| C9 | 3 | `submitting` state קיים. |
| C10 | 1 | — |
| C11 | 2 | Canvas signature → אובד ברענון. |
| C12 | 4 | "יש לחתום על הכנס" / "יש להקליד שם" ברור. |
| C13 | 2 | אין preview לחתימה אחרי drawn. |
| C14 | N/A | — |

**Average:** 3.3 / 5 (ה־flow הקצר מציל)

### B.12 FinancialAutonomy (FAE) — `pages/FinancialAutonomy.tsx`

**תיאור:** KPI strip auto-fit + tabs + meta + anomalies. דף ארוך, כמה מאות שורות CSS in-JS.

| C | Score | Finding |
|---|:---:|---------|
| C1 | 4 | title + subtitle + live dot. טוב. |
| C2 | **2** | **BUG-UX-B14 (HIGH): עמוד גדול מאוד, `autofit 170px` = עד 8 KPIs במסך רחב, + 6 tabs (ראה FAE), + panels. ההתמצאות קשה.** |
| C3 | 3 | tabBar עם active state ברור. |
| C4 | 5 | RTL. |
| C5 | 3 | SEVERITY_META עם אייקונים — טוב. |
| C6 | 2 | פעולות (אישור/ביטול anomaly) — לא נראה confirm. |
| C7 | 1 | — |
| C8 | 2 | — |
| C9 | 3 | — |
| C10 | 1 | — |
| C11 | 1 | — |
| C12 | 3 | ANOMALY_TYPE_LABEL טוב — אבל סיבה לא מוסברת. |
| C13 | 2 | — |
| C14 | 4 | KPIs למעלה, אבל יותר מדי. |

**Average:** 2.7 / 5

### B.13 HRAutonomy — `pages/HRAutonomy.tsx`

**תיאור:** 8 tabs — dashboard / employees / recruitment / onboarding / attendance / payroll / performance / compliance. ~1500+ שורות.

| C | Score | Finding |
|---|:---:|---------|
| C1 | 4 | title + subtitle + liveDot. |
| C2 | **1** | **BUG-UX-B15 (CRITICAL): 8 tabs × מספר panels = ~50 אזורים במסך אחד. הטעינה הקוגניטיבית עצומה.** |
| C3 | 3 | — |
| C4 | 5 | — |
| C5 | 2 | — |
| C6 | 2 | `handleApproveLeave` / `handleRejectLeave` — ללא confirm. |
| C7 | 1 | — |
| C8 | 2 | — |
| C9 | 3 | polling כל 3s — feedback טוב. |
| C10 | 1 | — |
| C11 | 1 | 10+ inline forms (recruitment, performance, review) — כולם ללא persistence. |
| C12 | 2 | — |
| C13 | 2 | — |
| C14 | 3 | KPI strip 8 columns — יותר מדי. |

**Average:** 2.3 / 5

**Top Findings:**
- BUG-UX-B15 (CRITICAL): פצל את HRAutonomy ל־sub-routes. 8 tabs בדף אחד עם inline forms = UX גרוע.

### B.14 HoursAttendance — `pages/HoursAttendance.tsx`

**תיאור:** 5 tabs (hours entry / requests / absences / balances / reports).

| C | Score | Finding |
|---|:---:|---------|
| C1 | 4 | Header comment מסביר — אבל זה ב־JSDoc, לא על המסך. |
| C2 | 3 | 5 tabs OK; בכל tab — טופס מרובה שדות. |
| C3 | 3 | — |
| C4 | 5 | — |
| C5 | 2 | — |
| C6 | 2 | שינוי סטטוס בקשה — ללא confirm. |
| C7 | 1 | — |
| C8 | 2 | — |
| C9 | 2 | — |
| C10 | 1 | — |
| C11 | 1 | — |
| C12 | 2 | — |
| C13 | 2 | — |
| C14 | 4 | Balances tab = value visualization. |

**Average:** 2.6 / 5

### B.15 LiveMap — `pages/LiveMap.tsx`

| C | Score | Finding |
|---|:---:|---------|
| C1 | 3 | אין header; רק המפה. |
| C2 | 5 | מפה = focus יחיד. |
| C3 | 2 | אין CTA (add pin / route). |
| C4 | 5 | — |
| C5 | 2 | — |
| C6 | N/A | — |
| C7 | 1 | — |
| C8 | 3 | — |
| C9 | 3 | Leaflet markers live. |
| C10 | 1 | — |
| C11 | N/A | — |
| C12 | 3 | Popup על marker. |
| C13 | N/A | — |
| C14 | 1 | אין KPIs (זמן נסיעה, עובדים פעילים). |

**Average:** 2.6 / 5

### B.16 Other Techno-Kol Pages (bundled assessment)

הדפים הבאים נבדקו פחות לעומק אך תובנות־מבטח דומות חלות:

- **Intelligence.tsx** — AI dashboard, KPIs רבים, חסר help text על מונחי AI.
- **ProjectAnalysis.tsx** — confidence scores ללא tooltip, alert()s קיימים.
- **Purchasing.tsx** — BOM management, 2+ confirm() קיימים (זיהוי באנליזה). **טוב יחסית.**
- **SupplyChain.tsx** — חזרה על Pipeline patterns.
- **IntelligentAlerts.tsx** — IAS v2, polling, חסר persistence על סינונים.
- **DocumentManagement.tsx** — DMS; 3 aria-label מצאתי — **היחיד עם a11y awareness.**
- **ProcurementHyperintelligence.tsx** — 3 confirm() קיימים. **טוב יחסית.**
- **SituationDashboard.tsx** — health scores ברורים, tooltip מינימלי.
- **DataFlowMonitor.tsx** — dev tool, לא end-user.
- **MobileApp.tsx** — mobile preview; לא production.
- **Pipeline.tsx** — 20 stages issue כפי שתואר.

**Average אומדן:** 2.5–2.8 / 5

### B.17 Sidebar + Navbar (Components)

**Path:** `components/Sidebar.tsx`, `components/Navbar.tsx`

| C | Score | Finding |
|---|:---:|---------|
| C1 | 4 | Sections + labels ברורים. |
| C2 | **2** | **BUG-UX-B16 (HIGH): Sidebar עם 25 פריטים — אפילו עם 6 sections = עומס ניכר. חלק מהפריטים כפולים: "supply-chain" + "Pipeline" + "Purchasing" + "Procurement" — לא ברור מה עושה מה.** |
| C3 | 4 | Active state — orange, ברור. |
| C4 | 5 | RTL, borderLeft ב־active. |
| C5 | N/A | — |
| C6 | N/A | — |
| C7 | 1 | — |
| C8 | N/A | — |
| C9 | 4 | LIVE indicator ב־Navbar מצוין. |
| C10 | 2 | `setSidebarOpen` toggle ב־Navbar — אבל אין Ctrl+B. |
| C11 | 3 | sidebarOpen נשמר ב־store (Zustand persist?). |
| C12 | 2 | אין tooltip על אייקוני אמוג'י. |
| C13 | N/A | — |
| C14 | N/A | — |

**Top Findings:**
- BUG-UX-B16 (HIGH): Sidebar עם 25 פריטים — קטגוריזציה יותר טובה + consolidation של Pipeline/SupplyChain/Purchasing/Procurement.

---

## C. Onyx Procurement Web — `onyx-procurement/web/`

### C.1 OnyxDashboard — `onyx-dashboard.jsx`

**תיאור:** מסך רכש עם 7 tabs, polling 30s.

| C | Score | Finding |
|---|:---:|---------|
| C1 | 4 | Header עם logo ותתי־פרטים. |
| C2 | 4 | 7 tabs — סביר. |
| C3 | 3 | Tab סביר. |
| C4 | 5 | RTL. |
| C5 | 4 | `api()` מחזירה "לא מאומת — חסר X-API-Key. עדכן ב-localStorage או ב-.env" — **זה next-step טוב.** |
| C6 | 2 | לא נבדק בעמקים — אבל אין חתימה של `confirm(` בתחילת קובץ. |
| C7 | 1 | — |
| C8 | 2 | — |
| C9 | 5 | `toast` system עם `showToast()` — ✓ |
| C10 | 1 | — |
| C11 | 1 | — |
| C12 | 2 | — |
| C13 | 3 | — |
| C14 | 4 | — |

**Average:** 3.0 / 5

**POSITIVE:** הודעות שגיאה הכי טובות — מפורטות next-step, ו־toast system קיים.

### C.2 VatDashboard — `vat-dashboard.jsx`

**תיאור:** 4 tabs (profile/periods/invoices/submissions) + PCN836 export.

| C | Score | Finding |
|---|:---:|---------|
| C1 | 5 | "ONYX · VAT" + subtitle דו־לשוני (he+en). |
| C2 | 5 | 4 tabs בלבד. |
| C3 | 4 | — |
| C4 | 5 | RTL. |
| C5 | 4 | Hebrew + English דואליות — טוב. |
| C6 | **1** | **BUG-UX-C01 (CRITICAL): PCN836 export (file 46-61) = הגשה למס הכנסה. קריאה ל־`apiDownload` ללא confirmation.** הגשה שגויה של מע"מ = קנסות. |
| C7 | 1 | — |
| C8 | 3 | — |
| C9 | 4 | Toast system. |
| C10 | 1 | — |
| C11 | 1 | — |
| C12 | 3 | — |
| C13 | **2** | **BUG-UX-C02 (HIGH): לפני PCN836 export — אין preview של סכום הדיווח / מספר החשבוניות / מע"מ קיזוז.** |
| C14 | 4 | — |

**Average:** 3.2 / 5

### C.3 BankDashboard — `bank-dashboard.jsx`

| C | Score | Finding |
|---|:---:|---------|
| C1 | 4 | "Bank Reconciliation" — ברור. |
| C2 | 4 | 5 tab זוגות. |
| C3 | 3 | — |
| C4 | 5 | — |
| C5 | 4 | — |
| C6 | 3 | תאורטית — unmatch/resolve discrepancy יכול להיות הרסני. |
| C7 | 1 | — |
| C8 | 2 | — |
| C9 | 4 | Toast. |
| C10 | 1 | — |
| C11 | 1 | — |
| C12 | 3 | Severity colors + labels טוב. |
| C13 | 3 | — |
| C14 | 4 | — |

**Average:** 3.0 / 5

### C.4 AnnualTaxDashboard — `annual-tax-dashboard.jsx`

**לא נפרס פה** — מצופה דפוס דומה. אומדן: 3.0 / 5.

---

## Summary Table

| Client | Screen | Avg | Criticals | Highs |
|--------|--------|:---:|:---------:|:-----:|
| Payroll | Dashboard | 2.4 | 0 | 1 |
| Payroll | WageSlips | 2.5 | 1 | 2 |
| Payroll | Compute | 2.8 | 0 | 3 |
| Payroll | Employees | 2.6 | 0 | 2 |
| Payroll | Employers | 2.8 | 0 | 1 |
| Techno-Kol | Dashboard | 2.6 | 0 | 0 |
| Techno-Kol | WorkOrders | 2.8 | 0 | 2 |
| Techno-Kol | ProductionFloor | 2.4 | 0 | 1 |
| Techno-Kol | Employees | 2.5 | 1 | 0 |
| Techno-Kol | Clients | 2.3 | 1 | 0 |
| Techno-Kol | Materials | 2.9 | 0 | 0 |
| Techno-Kol | Finance | 2.6 | 0 | 0 |
| Techno-Kol | AlertCenter | 2.8 | 0 | 0 |
| Techno-Kol | Pipeline | 2.5 | 0 | 1 |
| Techno-Kol | Documents | 2.8 | 0 | 1 |
| Techno-Kol | Signature | 3.3 | 0 | 0 |
| Techno-Kol | FAE | 2.7 | 0 | 1 |
| Techno-Kol | HR Autonomy | 2.3 | 1 | 0 |
| Techno-Kol | Hours | 2.6 | 0 | 0 |
| Techno-Kol | LiveMap | 2.6 | 0 | 0 |
| Techno-Kol | Sidebar | n/a | 0 | 1 |
| Onyx | Procurement | 3.0 | 0 | 0 |
| Onyx | VAT | 3.2 | 1 | 1 |
| Onyx | Bank | 3.0 | 0 | 0 |
| Onyx | AnnualTax | ~3.0 | 0 | 0 |

**Overall average (weighted):** **2.7 / 5**
**Criticals:** 5 | **Highs:** 16 | **Meds:** ~25

---

## Cross-Cutting Patterns

### 1. אין `confirm()` על פעולות הרסניות — כמעט בכל מקום
Grep מצא רק **9 שימושים** ב־`confirm(` בכל `techno-kol-ops/client/src`. מכיוון ש־25 עמודים × 2-3 פעולות הרסניות לכל אחד → כיסוי של ~10-15%. פעולות כמו הנפקת PDF, הגשה, אישור תלוש, שינוי סטטוס — ללא confirm.

### 2. אין Keyboard Shortcuts
Grep מצא **1 שימוש בלבד** ל־`onKeyDown` ב־App.tsx (Enter ב־login). אין Ctrl+S, Esc לסגירה, Ctrl+Enter לחישוב, Tab navigation מובנית.

### 3. אין Breadcrumbs
רק **DocumentManagement.tsx** מזכיר breadcrumb. 24/25 עמודים — ללא ניווט היררכי.

### 4. אין Form State Persistence
0 הימצאות של `localStorage.setItem` על טפסים בעמודי `/pages`. כל ה־engines אמנם persist ל־localStorage, אבל הטפסים עצמם — לא.

### 5. `alert()` במקום Toast/Modal
14 שימושים ב־`alert()` ב־techno-kol-ops — UX רגעי ולא מוביל. `payroll-autonomous/App.jsx:446-448` משתמש ב־alert כפעולת "צפה".

### 6. Dead Buttons (לא פונקציונליים)
- Techno-Kol `Employees.tsx:22` — "+ עובד חדש" ללא onClick
- Techno-Kol `Clients.tsx:14` — "+ לקוח חדש" ללא onClick
- Techno-Kol `WorkOrders.tsx:85` — "ייצוא Excel" ללא onClick
- Techno-Kol `WorkOrders.tsx:156-161` — "עדכן סטטוס" / "הדפס" ב־side panel ללא onClick

### 7. אין Validation Client-Side על שדות ישראליים
- ת.ז (check digit) — אין
- ח.פ — אין
- מס' חשבון בנק/סניף — אין

### 8. אין Skeleton Loading / Progressive Display
"טוען נתונים..." טקסט בלבד — המסך ריק עד תגובה.

### 9. חסר Help Text על שדות חוקיים/תקניים
"נקודות זיכוי", "שעות/חודש 182", "תיק ניכויים", "אחוז משרה" — שדות שחובה להסביר.

### 10. Sidebar עם 25 פריטים, כפילויות סמנטיות
Pipeline / SupplyChain / Purchasing / Procurement — חופפים חלקית.

---

## Go / No-Go

**Verdict: NO-GO for Production (UX perspective).**

**Blockers:**
1. **BUG-UX-A04 (CRITICAL):** הנפקת PDF תלוש ללא confirmation = קנסות חוק הגנת השכר.
2. **BUG-UX-C01 (CRITICAL):** PCN836 submission ללא confirmation/preview = קנסות מע"מ.
3. **BUG-UX-B08 (CRITICAL):** "+ עובד חדש" dead button → משתמש יחשוב שהמערכת שבורה.
4. **BUG-UX-B09 (CRITICAL):** "+ לקוח חדש" dead button — אותו דבר.
5. **BUG-UX-B15 (CRITICAL):** HRAutonomy 8-tabs megapage = לא שמיש ל־daily use.

**Not Blockers but Required:**
- 16 HIGH findings (form persistence, tooltips, confirmations, validation).
- Keyboard navigation & a11y — נדרש legal compliance (נגישות לאנשים עם מוגבלויות).

**Condition for GO:**
- סגירת כל ה־Criticals (5).
- סגירת לפחות 10 מתוך 16 ה־Highs.
- מעבר ל־QA-11 חוזר.

**Estimated dev effort to unblock:** 5-7 ימי פיתוח ל־UX אחד focused.

---

## Output Deliverables

1. `_qa-reports/QA-11-ux.md` — דוח מפורט (קובץ זה).
2. `_qa-reports/QA-11-ux-priorities.md` — Top 10 שיפורים לפי ROI.

---

**Signed:** QA-11 Agent — UX/Usability
**Date:** 2026-04-11
