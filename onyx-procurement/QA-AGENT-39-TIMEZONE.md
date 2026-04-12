# QA Agent #39 — Timezone, DST & Date Handling

**Project:** onyx-procurement
**Scope:** ניתוח סטטי בלבד של `server.js`, `supabase/migrations/001-supabase-schema.sql`, `web/onyx-dashboard.jsx`, `package.json`
**Date:** 2026-04-11
**Dimension:** Timezone / DST / Date Handling
**Target TZ:** Asia/Jerusalem (IST UTC+2, IDT UTC+3 ביום שישי האחרון של מרץ → יום ראשון האחרון של אוקטובר)

---

## TL;DR — 10 ממצאים קריטיים

| # | חומרה | נושא | מיקום |
|---|-------|------|-------|
| TZ-01 | CRITICAL | אין הגדרת `process.env.TZ` או `Intl.DateTimeFormat` עם timezone מפורש — השרת ירוץ לפי ברירת המחדל של הסביבה (Replit/Docker = UTC) | `server.js` (כולו) |
| TZ-02 | HIGH | `required_by_date`, `expected_delivery`, `actual_delivery` מוגדרים כ-`DATE` (ללא TZ) אך נכתבים מ-`new Date().toISOString().split('T')[0]` — מה שמחזיר את חלק התאריך ב-UTC, לא לפי Asia/Jerusalem | `schema.sql:86,203,222` + `server.js:533` |
| TZ-03 | HIGH | דדליין RFQ מחושב כ-`Date.now() + hours*3600000` — "24 שעות" הוא חלון של 86,400,000 מילישניות ולא "סוף יום העסקים למחר" ולא מתחשב ב-DST | `server.js:255` |
| TZ-04 | HIGH | הודעת WhatsApp מציגה `deadline.toLocaleDateString('he-IL')` ו-`toLocaleTimeString('he-IL')` ללא `timeZone: 'Asia/Jerusalem'` — המחרוזת משקפת את ה-TZ של תהליך Node, לא של המשתמש בישראל | `server.js:270` |
| TZ-05 | MEDIUM | `new Date().toLocaleDateString('he-IL')` בהודעת PO — אותה בעיה, המחרוזת תהיה לפי TZ של השרת. בהפעלה על Replit/Vercel זה יציג תאריך UTC שעלול להקדים יום בלילה | `server.js:642` |
| TZ-06 | MEDIUM | דשבורד React משתמש ב-`new Date(o.created_at).toLocaleDateString("he-IL")` ללא `timeZone` — הדפדפן ישתמש ב-TZ המקומי של הלקוח (בדרך כלל Asia/Jerusalem, אבל לא מובטח — ספק Foshan שנכנס לדשבורד יראה CST) | `onyx-dashboard.jsx:155,319,462` |
| TZ-07 | MEDIUM | אין עמודות של TZ לשליפת "30 יום אחרונים" / "שבוע אחרון" — אין פילטרי תאריכים ב-API analytics כלל; כל החישובים נעשים על כל הטבלה. סקייל אחד הוא מנגנון של "המרת תאריכים לפי TZ של העמדת DBMS" | `server.js:805-845` |
| TZ-08 | MEDIUM | WhatsApp Webhook שומר `msg.timestamp` (Unix epoch Meta) לתוך `data` JSONB אך אין עמודה `delivered_at` או `received_at` מבוססת TIMESTAMPTZ שרושמת את זמן ההגעה בפועל | `server.js:893` |
| TZ-09 | LOW | כל יתר עמודות ה-DB הן TIMESTAMPTZ (בסדר) — אבל תאריכי מפתח של לוגיסטיקה הם DATE (לא בסדר). מעורבות → פירושים שונים בכל סוג | `schema.sql` (כל הסכמה) |
| TZ-10 | LOW | חוסר תווית TZ בתצוגה ("12/04/2026 14:00" — בלי IDT/IST) — משתמש לא יודע אם מדובר בשעון ישראל, UTC, או לוקאלי | `server.js:270`, `onyx-dashboard.jsx:319` |

---

## 1. מצב תשתית תאריכים

### 1.1 ללא ספריית תאריכים
- `package.json` dependencies: `express`, `@supabase/supabase-js`, `dotenv`, `cors` בלבד
- **אין** `moment`, `dayjs`, `date-fns`, `luxon`
- כל חישובי הזמן = JavaScript `Date` נטיבי → חשוף לבעיות TZ/DST של ה-host

### 1.2 ללא הגדרת timezone בתהליך
- `server.js` לא קובע `process.env.TZ = 'Asia/Jerusalem'`
- אין `Intl.DateTimeFormat` עם `timeZone` מפורש
- **תוצאה צפויה ב-Replit/Heroku/Vercel (ברירת מחדל UTC):**
  - `new Date().toLocaleDateString('he-IL')` ב-23:30 Asia/Jerusalem = **21:30 UTC** → `toLocaleDateString` עם locale he-IL אך **TZ UTC** → יציג את היום **ללא תלות בזמן לוקאלי של המשתמש** — המשתמש בישראל יראה תאריך "של אתמול" בלילה
  - בשעון קיץ (IDT, +03), הבעיה מחריפה — כל ימי אחרי 21:00 ישראל יוצגו כיום הקודם

---

## 2. סכימה — TIMESTAMPTZ מול DATE

### 2.1 עמודות TIMESTAMPTZ (מצב טוב)
- `created_at`, `updated_at` בכל הטבלאות → נכונים: PG ממיר UTC↔client
- `response_deadline`, `sent_at`, `reminder_sent_at`, `received_at`, `decided_at`, `approved_at`, `last_order_date` — כולן TIMESTAMPTZ ✅

### 2.2 עמודות DATE (מצב בעייתי)
- `purchase_requests.required_by_date DATE` (שורה 86)
- `purchase_orders.expected_delivery DATE` (שורה 203)
- `purchase_orders.actual_delivery DATE` (שורה 222)

**הבעיה:** `DATE` ב-PG = יום לוגי חסר TZ. כשהשרת רץ ב-UTC וכותב `new Date(Date.now() + days*86400000).toISOString().split('T')[0]` (server.js:533), התאריך המחושב הוא **UTC calendar date**.

**דוגמה קונקרטית:**
- ספק ב-Asia/Jerusalem מבטיח "אספקה בעוד 3 ימים"
- מערכת מופעלת ב-11 באפריל 2026 בשעה 22:00 Asia/Jerusalem (= 19:00 UTC)
- `Date.now() + 3*86400000` → 14 באפריל 19:00 UTC
- `.toISOString().split('T')[0]` → `"2026-04-14"` ✅ (תקין במקרה זה)
- אך אם הפעולה מתבצעת ב-23:30 Asia/Jerusalem = 20:30 UTC של 11 באפריל, `new Date()` יהיה 11/04 20:30 UTC → +3 ימים = 14/04 20:30 UTC → split ל-`"2026-04-14"`
- **ב-01:00 Asia/Jerusalem של 12/04 = 22:00 UTC של 11/04**, אותה נוסחה תחזיר `"2026-04-14"` במקום `"2026-04-15"` (המשתמש חושב שעברנו ליום 12/04)

**תוצאה:** תאריכי אספקה עלולים להיות מוקדמים ביום אחד בכל הפעלה בלילה.

---

## 3. חישוב "24 שעות" של RFQ (server.js:255)

```js
const deadline = new Date(Date.now() + (response_window_hours || 24) * 3600000);
```

### 3.1 זה חלון של 86.4M ms, לא "יום עסקים"
- **24 * 3600000 = 86,400,000 ms** מהרגע הנוכחי, לא "סוף יום מחר"
- אם הפעלה ב-16:00 יום רביעי → דדליין יום חמישי 16:00 (ספק חושב שיש לו את יום חמישי המלא)
- אם הפעלה ב-23:45 יום רביעי → דדליין יום חמישי 23:45 — הדדליין נראה כמו "סוף יום חמישי" אבל קרוב לחצות

### 3.2 DST spring-forward (יום שישי האחרון של מרץ 2026 = 27/3/2026)
- הפעלת RFQ ב-26/3 שעה 01:30 IST (UTC+2) = 23:30 UTC של 25/3
- חישוב: `Date.now() + 24*3600000` = 23:30 UTC של 26/3 = 01:30 UTC+2 של 27/3 (**לפני** הקפיצה ב-02:00)
- אבל ספק בישראל יראה דדליין "26/3 01:30" בעוד שעון הקיץ קופץ ב-02:00 → השעה **02:00-03:00** לא קיימת בכלל
- אם הלקוח מגיש דוח ב-02:30 IDT → הדוח לא מתקבל (השעון דילג)

### 3.3 DST fall-back (יום ראשון האחרון של אוקטובר 2026 = 25/10/2026)
- הפעלת RFQ ב-24/10 שעה 02:30 IDT (UTC+3) = 23:30 UTC של 23/10
- חישוב: דדליין 25/10 02:30 **אך 02:00-03:00 ביום זה מופיע פעמיים** (פעם אחת IDT, פעם שנייה IST)
- "דדליין 02:30" = **אמביגואלי** — איזה 02:30? הראשון או השני?
- `toLocaleString('he-IL')` יציג "02:30" ללא הבהרה; ספק עלול להגיב בחלון השני אחרי שהדדליין "עבר" טכנית

**המלצה:** לעגל דדליינים ל-09:00/17:00 Asia/Jerusalem בלבד, ולעולם לא לתוך 02:00-04:00 בימי DST.

---

## 4. תצוגת דדליין ב-WhatsApp (server.js:270)

```js
`דדליין: ${deadline.toLocaleDateString('he-IL')} ${deadline.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}`,
```

### בעיות:
1. **חסר `timeZone: 'Asia/Jerusalem'`** — המחרוזת תוצג לפי TZ של תהליך Node (UTC על Replit)
2. **חסר תווית TZ** — הספק לא יודע אם "14:00" הוא IDT/IST/UTC
3. **`toLocaleDateString('he-IL')`** = "DD.MM.YYYY" (נקודות) — לא עקבי עם פורמט שאר המערכת שמשתמש ב-`"DD/MM/YYYY"` חלקית

**תיקון מומלץ:**
```js
const fmt = new Intl.DateTimeFormat('he-IL', {
  timeZone: 'Asia/Jerusalem',
  dateStyle: 'short',
  timeStyle: 'short',
});
`דדליין: ${fmt.format(deadline)} (שעון ישראל)`,
```

---

## 5. "last 30 days" / "last 7 days" בדוחות

### 5.1 לא קיים
- `/api/analytics/savings` (שורה 805) — שולף את **כל** `procurement_decisions` ו-`subcontractor_decisions`, ללא פילטר תאריכים
- `/api/analytics/spend-by-supplier` (825) — כל הספקים עם `total_orders > 0`
- `/api/analytics/spend-by-category` (834) — כל `po_line_items`, ללא תאריך

### 5.2 השלכה
- אם/כשיתווסף פילטר, ללא תקינה של TZ הוא יגדיר חלון UTC ולא חלון ישראל
- דוח "ינואר 2026" שנריץ ב-02/02 14:00 Asia/Jerusalem (= 12:00 UTC) יאבד רשומות של 31/01 22:00-23:59 Asia/Jerusalem
- **Edge case של DST:** חודש מרץ ב-IDT = 31*24 - 1 = 743 שעות; דוח ש"מחלק לפי 24*31" יתן תוצאה שגויה ב-0.13%

---

## 6. WhatsApp Webhook — מעקב זמני הגעה (server.js:876-901)

```js
await supabase.from('system_events').insert({
  type: 'whatsapp_incoming', ...
  data: { from, text, messageId: msg.id, timestamp: msg.timestamp },
});
```

### בעיות:
1. **`msg.timestamp` הוא Unix epoch string מ-Meta (שניות, UTC)** — נשמר ב-JSONB ולא בעמודת TIMESTAMPTZ ייעודית → לא ניתן לשלוף בצורה יעילה
2. **אין השוואה מול `rfq_recipients.sent_at`** — אין חישוב "זמן תגובה של ספק" (SLA)
3. **`created_at` של `system_events`** הוא זמן **הגעת ה-webhook לשרת**, לא זמן השליחה של הספק → יכולים להיות עד 30s פער (retry של Meta)
4. אין עמודה `delivered_at` ב-`rfq_recipients` (ראיתי `delivered BOOLEAN` ו-`reminder_sent_at` בלבד)

**השלכה עסקית:**
- חישוב `avg_response_time_hours` (בעמודה של `suppliers`) לא מתעדכן אוטומטית מהמערכת הזו → הערך נשאר 0 תמיד

---

## 7. דשבורד React — תצוגת תאריכים (onyx-dashboard.jsx)

### שימושים נמצאו:
- שורה 155: `new Date(o.created_at).toLocaleDateString("he-IL")`
- שורה 319: `new Date(result.deadline).toLocaleString("he-IL")`
- שורה 462: `new Date(o.created_at).toLocaleDateString("he-IL")`

### בעיות:
1. **חסר `{ timeZone: 'Asia/Jerusalem' }`** בכל הקריאות
2. **הדפדפן בוחר TZ אוטומטית** — משתמש שמריץ את הדשבורד בסין (Foshan = Asia/Shanghai, CST UTC+8) יראה תאריך **יום אחר מזה של הספק הישראלי**
3. **אין תווית TZ** ליד התאריכים
4. **ללא formatting עקבי** — פעם `toLocaleDateString` (רק תאריך), פעם `toLocaleString` (תאריך+שעה) — הדדליין מוצג עם שעה אבל `created_at` בלי
5. Hard-refresh כל 30s (`setInterval(refresh, 30000)`) — לא חוצה חצות בצורה מכוונת; אם סה"כ חוצים חצות במהלך session, התצוגה מתעדכנת אוטומטית רק לפי התאריכים של ה-API, לא של UI header/counters

---

## 8. ספק cross-timezone (Foshan, סין) — תרחיש משעמם-מסוכן

### תרחיש:
1. מזכירה בתל אביב יוצרת RFQ ב-12/04/2026 10:00 IDT (= 07:00 UTC)
2. חלון תגובה: 24 שעות → `deadline = Date.now() + 86400000` = 13/04 07:00 UTC = 13/04 15:00 Asia/Shanghai = 13/04 10:00 IDT
3. הודעת WhatsApp נשלחת לספק ב-Foshan עם טקסט "`דדליין: 13/04/2026 10:00`" (לפי TZ של תהליך Node = UTC → **10:00** בפועל הוא **UTC**!)
4. הספק בסין קורא "10:00" → חושב 10:00 Asia/Shanghai (שעה 02:00 UTC) → מגיב ב-09:30 Asia/Shanghai = 01:30 UTC
5. המערכת מחשבת: 01:30 UTC של 13/04 **לפני** הדדליין 07:00 UTC ✅ (במקרה טוב)
6. אבל אם הדדליין המוצג היה "10:00" והספק הבין "10:00 IDT" = 07:00 UTC = 15:00 CST → הוא לא יספיק להגיב בכלל

### המלצה קריטית:
- כל תצוגת דדליין למיילים/WhatsApp חייבת לכלול **את ה-TZ של המקבל, לא של השולח**
- לפי `suppliers.country TEXT DEFAULT 'ישראל'` קיים שדה מקור TZ — **אבל לא קיים `suppliers.timezone`**
- דרוש להוסיף `suppliers.timezone TEXT DEFAULT 'Asia/Jerusalem'` ולהמיר את הדדליין להתאמה בכל פנייה

---

## 9. `NOW()` של Postgres מול JS `new Date()`

### הבדל מהותי:
- `created_at TIMESTAMPTZ DEFAULT NOW()` → **NOW() של PG** שומר UTC ומוסיף מטא-TZ → בטוח
- `last_order_date: new Date().toISOString()` (server.js:579) → Node מייצר ISO8601 עם Z → מתפרש כ-UTC ע"י PG → בטוח
- `approved_at: new Date().toISOString()` (server.js:618) → זהה, בטוח
- `sent_at: new Date().toISOString()` (server.js:669) → זהה, בטוח
- **אבל** `expected_delivery: new Date(...).toISOString().split('T')[0]` (server.js:533) → **מסוכן** כי הפורמט הוא `DATE` ואובדת שעה — הימנעות פוטנציאלית מ-DST

### ממצא בסיסי:
כל עוד העמודה היא **TIMESTAMPTZ** וההכנסה היא **ISO string עם Z**, המצב תקין לקריאה/כתיבה בסיסית. הבעיה מתחילה רק בתצוגה (ללא timeZone: 'Asia/Jerusalem') ובחישוב עסקי (ימים, שעות, דדליינים).

---

## 10. המלצות תיקון מועדפות

### Priority 1 — חובה (שבוע אחד)
1. **הוסף בתחילת `server.js`:**
   ```js
   process.env.TZ = process.env.TZ || 'Asia/Jerusalem';
   ```
2. **הפוך את כל הקריאות של `toLocaleDateString`/`toLocaleString`/`toLocaleTimeString` בשרת לכלול `{ timeZone: 'Asia/Jerusalem' }`**
3. **שנה את השדה `expected_delivery`** — אל תחשב ב-`new Date(Date.now() + days*86400000).toISOString().split('T')[0]`; חשב דרך `Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' })` כדי לקבל YYYY-MM-DD נכון
4. **עמודת `suppliers.timezone TEXT DEFAULT 'Asia/Jerusalem'`** + פורמט דדליינים לפי TZ של הספק

### Priority 2 — מומלץ (שבועיים)
5. **הוסף פילטרי תאריכים ל-`/api/analytics/*`** — `?from=YYYY-MM-DD&to=YYYY-MM-DD&tz=Asia/Jerusalem`
6. **הוסף `rfq_recipients.delivered_at TIMESTAMPTZ`** וכן `responded_at` + חישוב אוטומטי של `avg_response_time_hours`
7. **עגל דדליינים לשעה 17:00 Asia/Jerusalem** ולא ל-`Date.now() + 24h`
8. **תווית `(שעון ישראל)` או `(IDT)`/`(IST)` בכל תצוגת שעה** בדשבורד
9. **הוסף ספרית `date-fns-tz`** או `luxon` — לא להסתמך על `Date` נטיבי
10. **הגדר בבדיקה את ה-TZ של הלקוח (`Intl.DateTimeFormat().resolvedOptions().timeZone`)** ותצוגה אזהרה אם זה לא Asia/Jerusalem

### Priority 3 — נחמד (חודש)
11. **DST test harness** — סימולציית 27/3/2026 02:00 ו-25/10/2026 02:00 עם יצירת RFQ דרך pytest/vitest
12. **חישוב business hours** ב-RFQ (להחריג שישי/שבת ישראלי, חגים)
13. **לוגר `Intl.DateTimeFormat().resolvedOptions()` באתחול**, לוודא שה-TZ מתואם

---

## 11. סיכום פגיעות קונקרטיות

| ID | נתיב ביצוע | תנאי הפעלה | אפקט |
|----|-----------|-------------|------|
| **BUG-TZ-A** | `POST /api/rfq/send` בלילה (22:00-00:00 Asia/Jerusalem) על Replit UTC | השרת ב-UTC | `expected_delivery` יוגדר יום מוקדם מהצפוי |
| **BUG-TZ-B** | `POST /api/rfq/send` ב-26/3/2026 מעל שעה לפני DST | חישוב דדליין נופל לתוך 02:00-03:00 | דדליין "אינו קיים" — שעון קופץ, הודעה ל-WhatsApp שגויה |
| **BUG-TZ-C** | `POST /api/rfq/send` ב-24/10/2026 | חישוב דדליין ב-02:30 שמתחיל פעמיים | אמביגואציה — הצעה מספק יכולה להיחשב "אחרי הדדליין" בטעות |
| **BUG-TZ-D** | שליחת PO לספק ב-Foshan | ספק פרשן "10:00" כשעון מקומי | לא עומדים ב-ETA, סכסוך לוגיסטי |
| **BUG-TZ-E** | צפייה בדשבורד מבראוזר ב-Asia/Shanghai | `toLocaleDateString` בלי timeZone | מציג יום שונה מהמסך של המזכירה בת"א |
| **BUG-TZ-F** | `avg_response_time_hours` של ספק | שדה מ-`suppliers` טבלה, לא מתעדכן ב-webhook | תמיד 0 — אין חישוב SLA |
| **BUG-TZ-G** | דוחות analytics ללא פילטר | מחסור בפונקציונליות + חוסר TZ כשכן יוסיפו | כל "last 30 days" יהיה UTC |

---

## 12. קבצים שנותחו

- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\onyx-procurement\server.js` (934 שורות)
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\onyx-procurement\supabase\migrations\001-supabase-schema.sql` (563 שורות)
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\onyx-procurement\web\onyx-dashboard.jsx` (710 שורות)
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\onyx-procurement\package.json` (16 שורות)

**סטטוס QA-WAVE1-DIRECT-FINDINGS.md:** לא מכיל שום ממצאי TZ/DST — לא חופף.

---

**Agent:** QA #39 — Timezone, DST & Date Handling
**Severity summary:** 1 CRITICAL, 3 HIGH, 4 MEDIUM, 2 LOW
