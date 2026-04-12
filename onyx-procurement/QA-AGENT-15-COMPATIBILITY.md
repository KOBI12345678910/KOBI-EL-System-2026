# QA AGENT 15 — דוח תאימות וסביבה (ONYX Procurement)

**תאריך:** 11.04.2026
**סוכן:** QA Agent 15 — Compatibility and Environment Specialist
**מתודולוגיה:** Static Analysis בלבד. לא בוצעה התקנה ולא הורצו קבצים.
**יעד פריסה:** Replit Pro (Kobi plan) + Supabase free tier

---

## 1. תמצית מנהלים

מערכת ONYX Procurement בנויה משלושה רכיבים עיקריים: שרת Node.js (`server.js`), דשבורד React (`web/onyx-dashboard.jsx`), ומסד נתונים Supabase. הניתוח הסטטי מגלה שהמערכת מבוססת על טכנולוגיות סטנדרטיות ללא פינים מדויקים של גרסאות (`engines` חסר ב-`package.json`), אך כוללת מספר מלכודות תאימות שעלולות להכשיל את הפריסה ב-Replit. המלכודת החמורה ביותר היא סתירה בין קידוד שורות של הקבצים: `server.js` ו-`package.json` נשמרו ב-LF (טוב ל-Unix), אך `web/onyx-dashboard.jsx` נשמר ב-CRLF (תבנית Windows).

**דירוג סיכון כללי:** בינוני-נמוך. המערכת תרוץ בפועל ב-Replit/Supabase מהרגע הראשון, אך ישנם 6 pitfalls שכדאי לטפל בהם לפני production.

---

## 2. מטריצת תאימות

### 2.1 רכיבי Runtime

| רכיב | גרסה מוצהרת | מינימום נדרש | מומלץ לבדיקה | סיכון | הערות |
|------|--------------|---------------|----------------|--------|--------|
| **Node.js** | לא מוגדר (`engines` חסר) | **Node 18 LTS** | Node 20 LTS | בינוני | Replit ברירת מחדל = Node 20. `--watch` (ב-`npm run dev`) דורש Node 18.11+ |
| **npm** | לא מוגדר | 9+ | 10+ | נמוך | חלק מ-Node 18/20 |
| **CommonJS vs ESM** | CommonJS (`require`) | Node 12+ | Node 18+ | נמוך | `package.json` ללא `"type": "module"` - ברירת מחדל CommonJS נכונה |
| **express** | `^4.21.0` | 4.21.0 | 4.21.x | נמוך | Express 5 יצא אך לא נדרש. `^` יתקע על 4.x |
| **@supabase/supabase-js** | `^2.45.0` | 2.45.0 | 2.45.x - 2.47.x | בינוני | SDK v2 תומך CommonJS ו-ESM. v2 API יציב, ללא breaking changes מתוכננים |
| **dotenv** | `^16.4.5` | 16.0.0 | 16.4.x | נמוך | יציב לחלוטין |
| **cors** | `^2.8.5` | 2.8.5 | 2.8.5 | נמוך | יציב (ללא עדכונים פעילים) |
| **React** | לא מוצמד (import ללא package.json) | **React 16.8+** (Hooks) | React 18.x | גבוה | `useState`/`useEffect`/`useCallback` דורשים Hooks API. אין `package.json` לדשבורד - הדשבורד לא נבנה עם build-tool |
| **https (core)** | built-in | Node 12+ | Node 18+ | נמוך | משמש ב-`sendWhatsApp` ו-`sendSMS` |

### 2.2 דפדפנים (Browser Support)

הדשבורד משתמש ב-ES features הבאים: `fetch`, `async/await`, destructuring, template literals, optional chaining (`?.`), nullish coalescing (`??`), arrow functions, `Promise.all`, `Map`/`Set`.

| דפדפן | מינימום תיאורטי | מומלץ לבדיקה | תאימות |
|--------|------------------|---------------|--------|
| **Chrome** | 80+ | 120+ | ירוק |
| **Safari** | 14+ | 17+ | ירוק |
| **Firefox** | 74+ (לא 70) | 120+ | ירוק (ראה הערה) |
| **Edge (Chromium)** | 80+ | 120+ | ירוק |
| **IE 11** | לא נתמך | - | אדום — דורש polyfills |
| **Samsung Internet** | 13+ | 23+ | ירוק |

**הערה:** בשאלה צוין "Firefox 70+" אך optional chaining (`?.`) זמין רק מ-Firefox 74. השימוש במחרוזת הדשבורד (`status?.dashboard || {}`, `toast?.type`) מוריד את התמיכה המינימלית ל-FF 74.

### 2.3 שירותים חיצוניים (APIs)

| שירות | גרסה בשימוש | גרסה נוכחית (אפריל 2026) | סיכון | הערות |
|--------|--------------|----------------------------|--------|--------|
| **WhatsApp Graph API** | `v21.0` | v21.0 נכנסה ב-Oct 2024. Meta משחררת גרסה חדשה כל רבעון | בינוני | עדיין נתמכת, אך יש לוודא שלא הוסרו endpoints. Meta שומרת גרסאות API במשך כשנתיים |
| **Supabase PostgREST** | SDK v2.45 | API יציב | נמוך | upsert עם `onConflict` (שורה 706) - נתמך |
| **Google Fonts (Rubik)** | `@import` בתוך CSS | יציב | בינוני | דורש גישת רשת לטעינה - ראה סעיף 3.2 |
| **Twilio SMS** | `/2010-04-01/` | גרסה זו עדיין פעילה | נמוך | רק אם הוגדר (`TWILIO_SID`) |

---

## 3. רשימת בדיקות סביבה (Environment Setup Checklist)

### 3.1 חובה לפני הפעלה ראשונה ב-Replit

- [ ] **הוסף שדה `engines` ל-`package.json`** — למרות שעובד בלי, זו best-practice:
  ```json
  "engines": { "node": ">=18.0.0" }
  ```
- [ ] **צור קובץ `.replit`** עם `run = "node server.js"` ו-`entrypoint = "server.js"`
- [ ] **הגדר Secrets ב-Replit** (לא דרך `.env` ציבורי):
  `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID`, `WHATSAPP_VERIFY_TOKEN`, `PORT`
- [ ] **Replit PORT** — Replit מגדיר `PORT` env var אוטומטית. הקוד משתמש ב-`process.env.PORT || 3100`, כך שיעבוד.
- [ ] **Supabase Row-Level Security (RLS)** — יש לוודא שמדיניות RLS מוגדרת, אחרת `SUPABASE_ANON_KEY` לא יצליח לקרוא/לכתוב.

### 3.2 בדיקות תאימות קוד

- [ ] **המר את `onyx-dashboard.jsx` מ-CRLF ל-LF** — כעת הוא CRLF (פורמט Windows). למרות ש-Node ו-Babel מתמודדים, git מסובך מזה:
  ```bash
  # בדיקה:
  file web/onyx-dashboard.jsx
  # תיקון:
  dos2unix web/onyx-dashboard.jsx
  ```
- [ ] **ודא שאין BOM** — בדיקה הצליחה, אין BOM באף אחד משלושת הקבצים. UTF-8 נקי.
- [ ] **הוסף `.gitattributes`** לייצוב line endings עתידיים:
  ```
  *.js   text eol=lf
  *.jsx  text eol=lf
  *.json text eol=lf
  *.md   text eol=lf
  ```
- [ ] **הדשבורד ללא build-tool** — אין webpack/vite/parcel. הקובץ בפורמט JSX לא ירוץ ישירות בדפדפן. דרושה אחת מהאפשרויות:
  1. הוספת Vite/esbuild
  2. המרה ל-HTML עם Babel Standalone + CDN React
  3. הרצה ב-Replit template של React

### 3.3 בדיקות Network

- [ ] **Google Fonts (Rubik)** — נטען בשורה 101 של הדשבורד דרך `@import url('https://fonts.googleapis.com/...')`. אם הרשת חסומה (למשל רשת ממשלתית/צבאית), הטקסט ייפול ל-`sans-serif` של המערכת. **אין fallback מוצהר** בקוד ה-CSS. הטקסט העברי יעבוד אבל לא בעיצוב Rubik.
- [ ] **Replit Outbound** — יש להבטיח ש-Replit מאפשר קריאות יוצאות ל: `supabase.co`, `graph.facebook.com`, `api.twilio.com`, `fonts.googleapis.com`.
- [ ] **Replit webview ל-dashboard** — הדשבורד קשיח על `const API = "http://localhost:3100"` (שורה 3). זו תקלה ידועה מ-QA WAVE 1 (B-02) - יש להחליף ב-`window.location.origin` או משתנה סביבה.

---

## 4. מלכודות תאימות מוכרות (Known Compatibility Traps)

### 4.1 סתירת Line Endings בין הקבצים
- **`server.js`** → LF (טוב ל-Unix/Replit)
- **`package.json`** → LF (טוב ל-Unix/Replit)
- **`web/onyx-dashboard.jsx`** → **CRLF (Windows)**

**השפעה:** Git ב-Replit עלול לסמן את כל הקובץ כשונה בכל pull. Node.js לא יטעה, אך כלי מדידת coverage, eslint, prettier, vitest יכולים להיכשל בהשוואות טקסט. מומלץ להאחיד ל-LF.

### 4.2 `engines` לא מוצהר ב-`package.json`
Replit בוחר את גרסת Node בהתאם ל-template. אם השתמשתם ב-template ישן (Node 12/14), `--watch` ייכשל ו-`async/await` ב-top-level ייכשל. **המלצה:** הוסיפו `"engines": { "node": ">=18.0.0" }` והרצה מדגמית בגרסאות 18/20.

### 4.3 `Rubik` font כ-hard dependency
Google Fonts נטען דרך CSS `@import`, לא דרך `<link rel="preload">`. המשמעות:
1. ה-CSS מתחיל להוריד את הפונט רק אחרי ש-React render ראשוני נגמר (FOUC - Flash of Unstyled Content).
2. אין fallback מוצהר. ב-`font-family: 'Rubik', sans-serif` - `sans-serif` יטען fallback אוטומטי, אבל זה תלוי מערכת הפעלה. במערכת ללא פונט עברי מותקן (נדיר ב-2026), עלולה להיות בעיה.
3. **פתרון מומלץ:** הוסיפו `<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>` ב-HTML, ו-font-family fallback: `'Rubik', 'Segoe UI', 'Tahoma', 'Arial Hebrew', sans-serif`.

### 4.4 Timezone Mismatch — Supabase vs UI
- **Supabase PostgreSQL** — שומר `TIMESTAMPTZ` ב-UTC (כל הזמנים מנורמלים ל-UTC פנימית, אבל המערכת מחזירה אותם עם offset).
- **השרת** — כל `new Date().toISOString()` (שורות 117, 282, 340, 533, 579, 619, 669) מייצר מחרוזת UTC (`Z` suffix).
- **הדשבורד** — `new Date(o.created_at).toLocaleDateString('he-IL')` (שורות 155, 462) ממיר חזרה ל-timezone של הדפדפן. זה עובד נכון רק אם הדפדפן של המשתמש ב-IST/IDT.
- **תרחיש בעיה:** משתמש בחו"ל (נגיד Kobi נוסע לאירופה) יראה תאריך יום אחד לאחור אם ההזמנה נוצרה קרוב לחצות IST. **פתרון:** השתמשו ב-`new Date(o.created_at).toLocaleDateString('he-IL', { timeZone: 'Asia/Jerusalem' })` במקום תלות ב-timezone של הדפדפן.

### 4.5 `.env` לא עמיד לטעויות ב-Replit
`dotenv` טוען `.env` מרמת השורש. ב-Replit `.env` יכול להיות מוחלף ב-Secrets tab ויש קונפליקט:
- אם קובץ `.env` קיים **וגם** Secrets מוגדרים, Replit Secrets לרוב גוברים (depends on plan), אך התנהגות לא דטרמיניסטית.
- **המלצה:** ב-Replit להסתמך על Secrets בלבד, ו-`dotenv.config()` עדיין לא יזיק (אם `.env` לא קיים, הוא רק יחזיר אזהרה).

### 4.6 WhatsApp Graph API v21 — חלון תמיכה
Meta מפרסמת גרסה חדשה ל-Graph API כל 3 חודשים וגורסת גרסאות ישנות כעבור כ-24 חודשים. v21.0 יצאה באוקטובר 2024. **תאריך כיבוי צפוי:** סביב Q4 2026. יש לעדכן ל-v23/v24 לפני סוף 2026 או לבדוק שהשרת מבצע graceful degradation אם חוזר 400/410.

### 4.7 Supabase free-tier Pause
Supabase משהה פרויקטים חינמיים לאחר 7 ימי חוסר פעילות (pause). כש-ONYX יורץ ב-Replit שגם הוא יכול להיכבות בתקופות רגיעה, יש סיכוי גבוה שבבוקר שני כל ה-DB יהיה במצב pause והקריאות הראשונות יקבלו 503. **פתרון:** cron-ping ל-`/api/status` כל 5-6 ימים, או שדרוג ל-Pro (25$/חודש).

### 4.8 Supabase SDK `^2.45.0` ו-`upsert` API
הקוד (שורה 706) משתמש ב-`.upsert(..., { onConflict: 'subcontractor_id,work_type' })`. זו התחביר החדש (v2). ב-v1 היה `.upsert(..., { returning: 'representation' })`. אין כאן deprecated API - זה מעודכן ונכון ל-v2.45.

### 4.9 Single-file JSX ללא build step
הדשבורד הוא קובץ `.jsx` יחיד עם `import { useState } from "react"` - זה לא ירוץ ישירות בדפדפן. חובה להחליט:
1. **Vite** (מומלץ ל-Replit) - `npm create vite@latest` + העתקת הקובץ
2. **Babel Standalone** בדפדפן + React UMD - הכי פשוט אבל איטי
3. **ESM imports מ-esm.sh** - דורש שינוי ה-import paths

ללא אחת מהאפשרויות, שום דפדפן לא יפרש את הקובץ.

### 4.10 Hard-coded `localhost:3100` בדשבורד
(כבר צוין ב-QA WAVE 1) — הדשבורד קשיח על `http://localhost:3100`. ב-Replit כל פרויקט מקבל URL ציבורי דינמי, ולכן הדשבורד לא יוכל לקרוא לשרת ב-production. **פתרון:** `const API = window.location.origin || "http://localhost:3100"`.

---

## 5. תשובות לשאלות החובה

| # | שאלה | תשובה תמציתית |
|---|-------|-----------------|
| 1 | Node versions | חסר `engines`. CommonJS פועל מ-Node 12+, אבל `--watch` ב-npm script דורש **Node 18.11+**. Supabase SDK v2 פועל מ-Node 14+ (תומך CJS ו-ESM). אין סתירה CJS/ESM. |
| 2 | React version | אין pinning. Hooks דורשים **React 16.8+**, המלצה React 18.x. |
| 3 | Browser minimum | Chrome 80+, Safari 14+, **Firefox 74+** (לא 70, בגלל `?.`), Edge 80+. |
| 4 | Replit quirks | `PORT` env var אוטומטי - קוד תקין. אין `.replit` - ליצור. Free tier עלול לכבות את ה-repl. Replit Secrets עדיף על `.env`. |
| 5 | Supabase SDK | `^2.45.0` - יציב, אין breaking changes במסגרת v2. `upsert` API עודכן נכון. אין deprecated APIs בשימוש. |
| 6 | Hebrew/UTF-8/BOM | כל שלושת הקבצים UTF-8 ללא BOM. תקין. |
| 7 | Line endings | `server.js` ו-`package.json` = **LF**. `onyx-dashboard.jsx` = **CRLF**. יש לאחד ל-LF ולהוסיף `.gitattributes`. |
| 8 | Google Fonts fallback | `@import` Rubik בלבד. נופל ל-`sans-serif` של המערכת אם הרשת חסומה. **אין preconnect, אין font-display: swap**. |
| 9 | WhatsApp v21 | יצאה Oct 2024. עדיין נתמכת אפריל 2026, אך תחליף צפוי תוך 6-12 חודשים. |
| 10 | Timezone | Supabase שומר ב-**UTC** (TIMESTAMPTZ). `toISOString()` מייצר UTC. `toLocaleDateString('he-IL')` ממיר ל-timezone של הדפדפן (לא קבוע ל-Asia/Jerusalem). |

---

## 6. תקציר חומרה וסיכום

- **הקוד תקין פונקציונלית** לפריסה ב-Replit Pro + Supabase free tier.
- **3 מלכודות חמורות:** CRLF בדשבורד, חוסר build-tool לדשבורד, `localhost:3100` קשיח.
- **4 מלכודות בינוניות:** חוסר `engines`, חוסר font fallback, Supabase pause ב-free tier, תלות timezone של דפדפן.
- **3 המלצות לטווח ארוך:** עדכון WhatsApp API v21 → v23, הוספת pings ל-Supabase, הוספת `.gitattributes`.

---

**סוף דוח QA Agent 15**
