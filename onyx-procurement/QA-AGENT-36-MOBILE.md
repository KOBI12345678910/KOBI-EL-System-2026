# QA Agent #36 — Mobile Responsiveness Audit
**Target:** `web/onyx-dashboard.jsx` (710 lines, single SPA)
**Scope:** Static analysis only — קובי משתמש מטלפון באתרי בנייה + דסקטופ
**Date:** 2026-04-11

---

## ציון כללי: D+ (42/100)
המערכת נבנתה desktop-first עם inline styles בלבד. היא לא שבורה בנייד (הודות ל-`auto-fit` ב-KPI grid), אבל רחוקה מ"מוכנה לשטח". יש כשלים קריטיים בעבודה מטלפון: אין viewport meta, אין media queries, שדות input מתחת ל-16px (תגרום ל-auto-zoom ב-iOS), tap targets מתחת ל-44px, ו-`grid5`/`grid4Small`/`grid3` עם עמודות קבועות שיישברו במסך 360px.

---

## 1. Viewport Meta Tag — **חסר לחלוטין** (קריטי)

**ממצא:** אין קובץ HTML wrapper ב-`web/` בכלל. רק `onyx-dashboard.jsx` יחיד. לא ניתן למצוא `<meta name="viewport">` בשום מקום בפרויקט.

**השלכה:** כשהאתר ייפתח בטלפון:
- iOS Safari ירנדר ב-980px וויוואלי וישרץ את העמוד (user zoom out)
- טקסט 11px יהיה זעיר מאוד, בלתי קריא
- Tap targets יהיו זעירים פי 2-3

**תיקון חובה:** ליצור `index.html` עם:
```html
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
```

**Severity:** CRITICAL BLOCKER — בלי זה, כל שאר האודיט אקדמי.

---

## 2. CSS Approach — Inline Styles בלבד

**ממצא:** כל ה-styling נעשה דרך `const styles = { ... }` JavaScript object (שורות 630-710). אין:
- Tailwind (אין `className="sm:..."`, `md:...`)
- CSS modules
- styled-components
- CSS-in-JS עם media query support (אין emotion/stitches)

**בלוק CSS מוטמע יחיד** (שורות 100-106):
```jsx
<style>{`
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #0c0f1a; }
  input, select, textarea, button { font-family: 'Rubik', sans-serif; }
  ::-webkit-scrollbar { width: 6px; } ...
`}</style>
```
אין בו אף `@media` query.

**השלכה:** אי אפשר להגדיר breakpoints דרך inline styles ללא `window.matchMedia` + React state. המערכת לא יכולה להגיב לגודל מסך. זו בעיה ארכיטקטונית — לא תוקנת בלי refactor.

**Severity:** HIGH — זה השורש של 80% מהבעיות למטה.

---

## 3. Responsive Breakpoints — **אפס**

**Grep ל-`@media`, `max-width`, `min-width`, `sm:`, `md:`, `lg:`, `breakpoint`:** 0 תוצאות בכל הקובץ.

היחידי שמקרב לרספונסיביות הוא `grid4`:
```jsx
grid4: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))" }
```
זה עובד. אבל זה המקום היחיד.

**הגרידים האחרים נעולים בעמודות קבועות:**
| Grid | Columns | מה יקרה ב-360px |
|------|---------|------------------|
| `grid2` | `1fr 1fr` | OK (2 עמודות צרות) |
| `grid3` | `1fr 1fr 1fr` | שדות לא קריאים, placeholder נחתך |
| `grid4Small` | `1fr 1fr 1fr 1fr` | גרוע — 4 inputs במסך 360px = 70px כ"א |
| `grid5` | `1fr 1.5fr 0.7fr 0.7fr 40px` | **שבור** — שורת פריט RFQ לא ניתנת לשימוש |

**Severity:** HIGH — `grid5` הופך את טופס ה-RFQ (הפעולה הכי נפוצה של קובי) לבלתי שמיש במובייל.

---

## 4. Tables with Many Columns — אין טבלאות, אבל יש "list rows" בעייתיים

**ממצא:** אין `<table>` בכלל. כל ה"שורות" הן `<div style={styles.listItem}>` עם `display: flex, justifyContent: space-between`.

**בעיה:** ב-OrdersTab שורה 459-470, יש שורת flex עם `supplier_name`+`source`+`date` משמאל וקוד+מחיר מימין. כשהשם ארוך (למשל "חברת ברזל ופלדה ישראל בע"מ") המבנה קורס — אין `overflow: hidden` או `text-overflow: ellipsis` באף אחד מ-`listTitle`/`listSub`/`supplierName`.

**ב-QuotesTab שורה 381-391:** אותו סיפור — רשימת הצעות עם סכום + פירוט משלוח. ב-360px זה כנראה ייעטף לשתי שורות ויהרוס alignment.

**Severity:** MEDIUM.

---

## 5. Forms — גודל inputs בעייתי (iOS zoom bug)

שורה 700:
```jsx
input: { width: "100%", padding: "8px 12px", ..., fontSize: 13 }
```

**בעיה קריטית ב-iOS Safari:** כל input עם `font-size < 16px` גורם ל-Safari **להגדיל את הדף אוטומטית כשהמשתמש נוגע בשדה**. זה קפיצה שמבלבלת את קובי כשהוא ממלא טופס RFQ מרכב. גם לא נסגר אוטומטית.

**Padding 8px + font 13px → גובה שדה ≈ 30px** — קטן מדי לאצבע בכפפה (קובי בבנייה).

**גובה מומלץ למובייל:** 44px מינימום. כאן: ~30px.

**Severity:** HIGH — כל מילוי טופס במובייל פרוס לשבירה.

---

## 6. Tap Targets — **רוב הכפתורים נכשלים ב-44×44** (Apple HIG)

מדידה מהסטיילים:

| Element | Padding | font | גובה כולל | תואם? |
|---------|---------|------|-----------|--------|
| `primaryBtn` | 10px 20px | 13px | ~36px | קרוב, לא מספיק |
| `secondaryBtn` | 8px 16px | 12px | ~30px | כשל |
| `smallBtn` (אישור הזמנה!) | 6px 14px | 12px | ~26px | **כשל חמור** |
| `removeBtn` (✕) | 6px 10px | 14px | ~28px | כשל |
| `refreshBtn` (🔄) | 6px 10px | 14px | ~28px | כשל |
| `tab` (navigation) | 8px 14px | 13px | ~31px | כשל |

**קריטי:** כפתור "✅ אשר" ב-OrdersTab (שורה 477) שקובי לוחץ ממכונית — **26 פיקסלים גובה**. שוגה בלחיצה תגרום ללחוץ על "📤 שלח לספק" במקום, שולחת PO לא מאושר.

**Tab navigation ב-`nav`:** overflow-x auto (שורה 645). במובייל הטאבים ייגללו אופקית — בעקרון טוב, אבל 7 טאבים × ~90px = 630px של רצועת גלילה אופקית בלתי טבעית. תחליף ל-hamburger menu.

**Severity:** CRITICAL (בעיקר smallBtn במסך אישור הזמנה).

---

## 7. Modal Dialogs — אין בכלל

**ממצא:** אין שום modal/dialog בקוד. פעולות "הוסף ספק" נפתחות **inline** תוך שימוש ב-`showAdd` state (שורה 204). זה בפועל גישה טובה למובייל (אין full-screen modal trap), אבל:

- אין `autoFocus` לשדה הראשון → המשתמש חייב לגעת שוב.
- אין סגירה אוטומטית אחרי שמירה מוצלחת כשהוא פתוח (זה כן מיושם בשורה 193 — נבדק וטוב).

**Toast message** ב-`position: fixed, top: 16` (שורה 709) — זה יופיע **מאחורי ה-notch/status bar** ב-iPhone. צריך `env(safe-area-inset-top)`.

**Severity:** LOW-MEDIUM.

---

## 8. Navigation — אין Hamburger, יש Horizontal Scroll

**שורה 645:**
```jsx
nav: { display: "flex", ... overflowX: "auto", ... }
tab: { ... whiteSpace: "nowrap" }
```

**מה קורה ב-360px:** 7 טאבים, כל אחד בערך 90px עם האייקון → 630px רצועה אופקית. המשתמש רואה רק 4 טאבים, חייב לגלול אופקית — חוויה לא אינטואיטיבית ברוב אפליקציות הנייד. אין affordance שיש עוד טאבים (אין דהייה בקצה / חץ / גרדיאנט).

**אין scroll-snap** → גלילה "חלקלקה" ולא מדויקת.

**אין active tab auto-scroll-into-view** → אם קובי עובר לטאב שנחתך, זה לא יתגלגל אליו.

**תיקון מומלץ:** hamburger menu ב-<768px, או bottom tab bar (Material Design) עם 4-5 pills חיוניים.

**Severity:** MEDIUM.

---

## 9. Charts/Graphs — אין בכלל

**ממצא:** 0 charts בדשבורד. רק KPI cards עם מספרים + אימוג'י. אין recharts/chart.js/d3. זה למעשה **פלוס** למובייל — פחות מורכבות, פחות חישובי layout.

**חסר במיוחד:** גרף savings לאורך זמן, pie chart לחלוקת ספקים. כשיתווספו — חייב `ResponsiveContainer` (recharts) או דומה.

**Severity:** לא רלוונטי כרגע.

---

## 10. Sticky Headers/Footers — **אין**

**ממצא:** Header (שורה 634) הוא `display: flex` רגיל ללא `position: sticky`. במסך ארוך (SuppliersTab עם 30 ספקים, OrdersTab עם רשימת PO), המשתמש מאבד context — לא רואה את כפתור הרענון, לא רואה את הסטטוס.

**ב-iOS**, הכתובת bar מוסתרת בגלילה כלפי מטה → פחות real estate, אבל הכותרת נעלמת → אין דרך לדעת איפה הוא ב-stack.

**תיקון:** `header { position: sticky; top: 0; z-index: 10 }` + כנ"ל ל-`nav`.

**Severity:** MEDIUM.

---

## 11. Touch Gestures vs Mouse-Only

**Grep ל-`onMouseEnter`/`onHover`/`onDragStart`:** לא נמצאו. **זה טוב** — אין hover-only states.

**אבל:**
- אין `onTouchStart`/`onSwipe` — לא ניתן לגלול בטאבים (swipe left/right בין sections). רכיב טוב לרכישת חווייה "אפליקציה".
- כפתור "רענון" (🔄) — אין pull-to-refresh. במובייל זה הציפייה המינימלית.
- אין `touch-action: manipulation` על כפתורים → delay של 300ms ב-iOS ישן (פחות רלוונטי עכשיו עם viewport tag).

**Severity:** LOW (nice-to-have).

---

## 12. Soft Keyboard Handling — **לא מטופל**

**ממצא:** אין `input[inputMode]` / `type="tel"` / `type="email"` לשדות הרלוונטיים.

**שורה 596:**
```jsx
function Input({ label, value, onChange, type = "text", placeholder = "" }) {
  return (
    <input type={type} ... />
```

רק `type="number"` מועבר מדי פעם (למחיר/כמות). **בעיות:**

1. **שדה טלפון (שורה 209)** — `type="text"` → מקלדת רגילה עם אותיות. קובי צריך להקיש "052-..." עם מעבר טאב למספרים. זה רע. **חייב `type="tel"`.**
2. **שדה אימייל** — `type="text"` → אין קיצור ל-`@` במקלדת. **חייב `type="email"`.**
3. **שדות כמות/מחיר** — עובד (`type="number"`), אבל ב-iOS זה מביא מקלדת מלאה עם אותיות. עדיף `inputMode="decimal"`.
4. **אין `autoCapitalize="none"`** — שמות ספקים בעברית זה OK, אבל שדות טכניים (URL/email) יקבלו autocap ב-iOS.

**קפיצת שדה חוץ למסך:** אין `scrollIntoView({ block: "center" })` כשהמקלדת עולה. ב-iPhone SE (568px גובה), מחצית המסך מכוסה במקלדת → השדה שכבת הטקסט פעיל בו עלול להיות מתחת למקלדת. אין fix באפליקציה.

**Severity:** HIGH (חוויה גרועה לגמרי לטופס RFQ מהטלפון).

---

## 13. Performance on Low-End Android

**CSS complexity — חיובי:**
- אין animations מורכבות (רק `animation: fadeIn 0.3s` ב-toast)
- אין `filter: blur`, אין shadows כבדים (רק `boxShadow` פשוט ב-toast)
- אין gradients מוגזמים (יש 3-4 gradients סטטיים, OK)

**JS bundle — לא נמדד ישירות** (אין `package.json` חתוך כאן), אבל מהקוד:
- React (לא מוגדר גרסה בקובץ)
- אין lazy loading לטאבים — כל 7 הטאבים נטענים מראש
- `setInterval(refresh, 30000)` ב-שורה 45 — **בעיה לסוללה**! כל 30 שניות fetch × 6 endpoints = 12 בקשות בדקה. מכבה את הבטרייה + מבזבז data של קובי בסלולר.

**Font loading:** `@import url('https://fonts.googleapis.com/css2?family=Rubik:...')` (שורה 101) — **render-blocking**. חייב `<link rel="preload" as="font">` או self-hosting.

**Severity:** MEDIUM (polling + render-blocking font = איטיות נראית לעין).

---

## 14. PWA Potential — **לא קיים**

**Glob ל-`manifest.json` בכל `onyx-procurement`:** 0 תוצאות.

**השלכות:**
- קובי לא יכול "להתקין" את האפליקציה למסך הבית
- אין splash screen
- אין ניתוק מ-browser chrome (נראה כמו אתר, לא כמו אפליקציה)
- אין push notifications (מוצלא ל-"RFQ התקבל")

**לתיקון מלא:**
```json
{
  "name": "ONYX רכש",
  "short_name": "ONYX",
  "start_url": "/",
  "display": "standalone",
  "theme_color": "#f59e0b",
  "background_color": "#0c0f1a",
  "dir": "rtl",
  "lang": "he",
  "icons": [ ... ]
}
```

**Severity:** MEDIUM (פספוס הזדמנות, לא באג).

---

## 15. Offline Support — **אין**

**Glob ל-`service-worker*`:** 0 תוצאות.

**קריטי לקובי:** באתרי בנייה בפריפריה (צפון/דרום) התקבלות סלולרית קופצת. אם הוא באמצע הזנת RFQ עם 8 פריטים, הרשת נופלת → הכל נעלם.

**מה חסר:**
1. **Service Worker עם cache-first ל-assets** — כרגע הקובץ נטען מחדש בכל visit
2. **Offline queue ל-POSTs** — אם קובי לוחץ "שלח RFQ" בלי רשת, צריך לשמור ב-IndexedDB ולשלוח כשחוזרת רשת
3. **Optimistic UI** — מסיר את חוויית "טוען..." ב-API failures
4. **No offline indicator** — אין שום נראות למשתמש אם אין רשת. ה-API yum מחזיר `{error: ...}` ב-try/catch (שורה 12), אבל בעיה ברשת פשוט תחזיר `{error: "Failed to fetch"}` והמשתמש לא יבין.

**Severity:** CRITICAL לשימוש שטח אמיתי.

---

## תרחישי קובי — מבחן מעשי

### תרחיש 1: שליחת RFQ מאתר בנייה (iPhone 12 Pro)
1. פותח `http://localhost:3100` (גם זה בעיה — localhost רק בדסקטופ) → **FAIL בעת הגעה**
2. אין viewport → טקסט פי 3 קטן מהצריך → **FAIL**
3. לוחץ על טאב "בקשת מחיר" → אולי לא רואה אותו (7 טאבים ב-scroll אופקי)
4. `grid5` של פריטים → 5 עמודות ב-360px = כל עמודה ~65px → **FAIL שמיש**
5. מקליד כמות → `font-size: 13px` → Safari zoom-in → קפיצת מסך → **FAIL חוויתי**
6. לוחץ "שלח" → רשת נופלת → `{error: "Failed to fetch"}` → כל המילוי נעלם → **FAIL קטסטרופלי**

**מסקנה:** לא שמיש בשטח כרגע.

### תרחיש 2: אישור PO מהרכב (iPhone בסטנד, נהיגה)
1. נכנס ל"הזמנות" → רשימה ארוכה, אין sticky header → גולל בלי אוריינטציה
2. מוצא את ה-PO → לוחץ `smallBtn` "✅ אשר" — **26px גובה!** → טעות לחיצה מתגלגלת ל"📤 שלח לספק" → **FAIL מסוכן** (שליחה של PO לא מאושר)

**מסקנה:** מסוכן. יש סיכון פעולה אוטומטית לא רצויה.

### תרחיש 3: צפייה בדשבורד ב-landscape
1. `grid4` עם `auto-fit, minmax(140px, 1fr)` → עובד **טוב** ב-landscape (4 עמודות)
2. אבל `main { maxWidth: 900, margin: "0 auto" }` (שורה 650) → במסך 844px נייד landscape זה עובד.
3. Header לא sticky → גולל ונעלם.

**מסקנה:** זה התרחיש הכי פחות גרוע. עובד סביר.

---

## המלצות לפי עדיפות

### **P0 — BLOCKERS (חייב לפני מובייל):**
1. להוסיף `<meta name="viewport">` (דרך HTML wrapper חדש)
2. להגדיל `input font-size` ל-16px (למניעת iOS zoom)
3. להגדיל `smallBtn` ל-44×44 min
4. `type="tel"` ו-`type="email"` לשדות הרלוונטיים
5. להוסיף error handler אמיתי ל-network failure (לא רק `{error}`)

### **P1 — HIGH (לפני רול-אאוט לשטח):**
6. Refactor `grid5`/`grid4Small`/`grid3` ל-`grid-template-columns` responsive (עם `matchMedia`)
7. Sticky header + nav
8. להשתמש ב-`safe-area-inset-*` ל-toast/header
9. להחליף polling ל-30s עם WebSocket או הגדלה ל-5min
10. Self-host הפונט במקום Google Fonts CDN

### **P2 — MEDIUM (שדרוגי UX):**
11. Hamburger menu או bottom tab bar
12. PWA manifest.json + icons
13. Service Worker לקאש
14. Offline queue ל-POSTs
15. Optimistic UI + אינדיקטור חיבור

### **P3 — NICE TO HAVE:**
16. Swipe gestures בין טאבים
17. Pull-to-refresh
18. scroll-into-view למקלדת פתוחה
19. Touch-action: manipulation

---

## סיכום אבחוני

האפליקציה בנויה כ-desktop React SPA עם inline styles ואפס אבסטרקציית רספונסיביות. היא **לא תיסגר ותישרף** במובייל (הודות ל-`auto-fit` ב-KPI, `flex` בחלק מה-sections, ו-`overflow-x: auto` ב-nav), אבל **שימוש אמיתי ממכשיר נייד יהיה מתסכל ומסוכן** (טעויות לחיצה, auto-zoom, איבוד נתונים בשכבת רשת).

**רמה נוכחית:** "עובד במובייל בסקרינשוטים" / **לא עובד בשטח**.

**Gap לייצור-מוכן-למובייל:** גדול. צריך HTML wrapper, media queries (כרוך ב-refactor style object), PWA manifest, Service Worker, ותיקון כל tap targets.

**עדיפות מקרו:** אם קובי באמת הולך להשתמש מהטלפון מאתר בנייה — **זה לא המצב הנוכחי**. צריך ספרינט של 3-5 ימי פיתוח לכל ה-P0+P1 כדי להגיע לרמה סבירה.
