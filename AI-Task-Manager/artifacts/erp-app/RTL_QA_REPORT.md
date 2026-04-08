# דוח QA — RTL ועברית
**תאריך:** 3 באפריל 2026  
**היקף:** בדיקת יישור RTL בכל המערכת  
**שיטת בדיקה:** חיפוש קוד מקור (grep), קריאת קבצים, אימות ידני של כל ממצא

---

## סיכום מנהלים

קיימת תמיכת RTL בסיסית טובה — ה-`<html>` מוגדר עם `lang="he" dir="rtl"`. עם זאת, נמצאו מספר בעיות ספציפיות. כל ממצא שלהלן **אומת ישירות בקוד המקור**.

---

## 1. יישור טקסט בדפים הראשיים

### ממצאים

**שימוש נרחב ב-`text-left` ללא היגיון RTL**

ב-RTL, `text-left` = יישור לצד שמאל הפיזי (ולא לצד "ההתחלה" הטבעי). נמצאו 405+ שימושים בקבצי `.tsx`. בחלק מהמקרים הדבר מכוון (מספרים, אחוזים), אך בדפים עיקריים המיכוון לא ברור.

**דפים עם בעיות מאומתות:**

| קובץ | שורות | תוכן |
|------|--------|-------|
| `pages/dashboard.tsx` | 1149, 1153, 1157, 1161, 1165, 1169, 1347 | תאי טבלת "סטטוס יומי" + div |
| `pages/modules/procurement-profitability.tsx` | 492, 497, 502 | תאי `<td>` בטבלה |
| `pages/modules/import-cost-calculator.tsx` | 617, 729, 747, 748, 754, 755 | כותרות עמודות וסכומים |
| `pages/modules/procurement-competitors.tsx` | 394, 395, 396, 408, 409, 410, 470, 471, 472, 484, 485 | ראשי עמודות ותאים |
| `pages/bi/comparative-analytics.tsx` | 197, 198, 199, 206, 358, 359, 360, 371, 372, 373 | עמודות נתונים |
| `pages/modules/exchange-rates.tsx` | 243, 271 | כותרות שערים |

---

## 2. כיוון טבלאות

### ממצאים

**כותרות עמודות עם `text-left` בטבלאות עברי (מאומת):**

- `pages/modules/procurement-competitors.tsx`:
  ```tsx
  <th className="text-left py-3 px-4">מחיר שלנו</th>
  <th className="text-left py-3 px-4">מחיר מתחרה</th>
  <th className="text-left py-3 px-4">הפרש %</th>
  ```
- `pages/modules/import-cost-calculator.tsx`:
  ```tsx
  <th className="text-right p-2 font-medium">קטגוריה</th>
  <th className="text-left p-2 font-medium">סכום (₪)</th>
  <th className="text-left p-2 font-medium">%</th>
  ```
  שים לב: עמודת "קטגוריה" — `text-right` (נכון), עמודות ערכים — `text-left` (לא עקבי)

- `pages/bi/comparative-analytics.tsx`:
  ```tsx
  <th className="text-left p-3 ...">תקופה 1</th>
  <th className="text-left p-3 ...">תקופה 2</th>
  <th className="text-left p-3 ...">סטייה מוחלטת</th>
  ```

**מיון:** לא נמצאו בעיות ספציפיות ביישור חצים בעמודות מיון — אין ממצאי RTL ספציפיים.

---

## 3. כיוון Modals ו-Drawers

### ממצאים

**בדיקה ישירה של `sm:text-left` / `sm:text-right`:**

| קומפוננטה | קובץ | מצב בפועל | RTL תקין? |
|-----------|------|-----------|-----------|
| Dialog | `components/ui/dialog.tsx:60` | `sm:text-right` | ✅ כן |
| Sheet | `components/ui/sheet.tsx:83` | `sm:text-right` | ✅ כן |
| Drawer | `components/ui/drawer.tsx:61` | `sm:text-left` | ❌ לא |
| AlertDialog | `components/ui/alert-dialog.tsx:52` | `sm:text-left` | ❌ לא |

**Drawer (`components/ui/drawer.tsx:61`) — בעיה מאומתת:**
```tsx
className={cn("grid gap-1.5 p-4 text-center sm:text-left", className)}
```
כותרת ה-Drawer מיושרת לשמאל במסכים גדולים — צריך `sm:text-right` ב-RTL.

**AlertDialog (`components/ui/alert-dialog.tsx:52`) — בעיה מאומתת:**
```tsx
"flex flex-col space-y-2 text-center sm:text-left"
```
כותרת אזהרה מיושרת לשמאל במסכים גדולים — צריך `sm:text-right` ב-RTL.

**Chat Panel (`components/chat/chat-panel.tsx:399`) — בעיה מאומתת:**
```tsx
className="fixed top-0 left-0 h-full w-full sm:w-[420px] ... border-r"
```
פאנל צ'אט מוצמד לצד **שמאל** עם `border-r`. ב-RTL, פאנל כזה אמור להיות מוצמד לצד **ימין** (`right-0`) עם `border-l`.

---

## 4. כיוון Forms

### ממצאים

**שדות LTR מכוונים — תקין:**

השדות הבאים קיבלו `dir="ltr"` בצדק:
- `email`, `phone`, `url` — תקין
- `date`, `datetime-local`, `time` — תקין (ממשק browser)
- `barcode`, `QR`, `color (#000000)` — תקין
- `slug`, `moduleKey`, `nameEn` — תקין
- `pre` לקוד מקור — תקין

**Accordion (`components/ui/accordion.tsx:29`) — בעיה מאומתת:**
```tsx
"flex flex-1 items-center justify-between py-4 text-sm font-medium transition-all hover:underline text-left [&[data-state=open]>svg]:rotate-180"
```
`text-left` על כפתור ה-Accordion — בממשק עברי, הטקסט צריך להיות מיושר לימין.

**Alert (`components/ui/alert.tsx:7`) — בעיה מאומתת:**
```tsx
"... [&>svg]:absolute [&>svg]:left-4 [&>svg]:top-4 ... [&>svg~*]:pl-7"
```
האייקון ממוקם בצד **שמאל** (`left-4`) עם ריפוד שמאלי (`pl-7`). ב-RTL, האייקון צריך להיות בצד **ימין** (`right-4`) עם `pr-7`.

**Email Templates (`pages/notification-settings/email-templates.tsx:366`) — מכוון:**
```tsx
style={{ minHeight: "280px", direction: "ltr" }}
```
עורך HTML — `direction: ltr` מוצדק לעריכת תוכן אימייל גנרי.

---

## 5. כיוון Date Pickers

### ממצאים

**Calendar (`components/ui/calendar.tsx`) — חלקית תקין:**

החצים מסובבים ב-RTL — תקין:
```tsx
String.raw`rtl:**:[.rdp-button\_next>svg]:rotate-180`,
String.raw`rtl:**:[.rdp-button\_previous>svg]:rotate-180`,
```

**בעיה: `range_start` ו-`range_end` (שורות 103, 107, 111) — מאומת:**
```tsx
day: "... [&:first-child[data-selected=true]_button]:rounded-l-md [&:last-child[data-selected=true]_button]:rounded-r-md"
range_start: "bg-accent rounded-l-md"
range_end: "bg-accent rounded-r-md"
```
ב-RTL, `range_start` הוא הצד הימני ויזואלית — צריך `rounded-r-md`. `range_end` הוא הצד השמאלי — צריך `rounded-l-md`. הכיוון **הפוך ממה שצריך**.

**שדות date/datetime ב-forms:**
```tsx
<input type="date" dir="ltr" />
```
שדות date מוגדרים `dir="ltr"` — תקין לפורמט YYYY-MM-DD של הדפדפן, אך התאריך מוצג LTR בתוך ממשק RTL. ייתכן שמבלבל אך אין חלופה טובה יותר.

---

## 6. בעיות ניווט ואייקונים

### ממצאים

**Pagination (`components/ui/pagination.tsx`) — שגוי (מאומת):**
```tsx
const PaginationPrevious = () => (
  <PaginationLink className="gap-1 pl-2.5" ...>
    <ChevronLeft className="h-4 w-4" />
    <span>Previous</span>    {/* אנגלית */}
  </PaginationLink>
)

const PaginationNext = () => (
  <PaginationLink className="gap-1 pr-2.5" ...>
    <span>Next</span>        {/* אנגלית */}
    <ChevronRight className="h-4 w-4" />
  </PaginationLink>
)
```
בעיות:
1. טקסטים "Previous" / "Next" באנגלית במקום עברית
2. ב-RTL, "הקודם" (פריט קודם) = כיוון **ימין** → `ChevronRight`, "הבא" = כיוון **שמאל** → `ChevronLeft` — חצים הפוכים
3. ריפוד `pl-2.5` / `pr-2.5` לא מותאם RTL

**Breadcrumb (`components/ui/breadcrumb.tsx:86`) — לוודא:**
```tsx
{children ?? <ChevronRight />}
```
מפריד breadcrumb `ChevronRight` ← ב-RTL, קריאת עין מימין לשמאל אז `ChevronLeft` הגיוני יותר ויזואלית. אמנם Radix לא הופך SVG אוטומטית ב-RTL.

**Status Transition (`components/status-transition.tsx`) — בעיה מאומתת:**
```tsx
<ArrowRight className="w-3 h-3" />  {/* שורה 60 */}
<ArrowRight className="w-4 h-4" />  {/* שורה 71 — ליד "מעבר סטטוס" */}
{i > 0 && <ArrowRight className="w-3.5 h-3.5" />}  {/* שורה 78 — בין סטטוסים */}
```
`ArrowRight` משמש לציון מעבר סטטוס — ב-RTL, חץ ימינה מכוון **לאחור** (כי RTL קורא מימין לשמאל). צריך `ArrowLeft` לציון "מעבר קדימה" בממשק RTL.

---

## 7. מיקום אלמנטים קבועים (Fixed)

### ממצאים

**Enhanced Toast (`components/ui/enhanced-toast.tsx:162`) — בעיה מאומתת:**
```tsx
<div className="fixed top-20 left-6 z-[60] ...">
```
ה-Toast מוצג בפינה **שמאל-עליון**. ב-RTL, הפינה הטבעית היא **ימין-עליון** (`right-6`).

**Chat Panel (`components/chat/chat-panel.tsx:399`) — כנ"ל:**
```tsx
className="fixed top-0 left-0 h-full w-full sm:w-[420px] ... border-r"
```
מוצמד לשמאל (`left-0`) עם `border-r` — ב-RTL צריך `right-0` עם `border-l`.

---

## 8. Sidebar — תקין

ה-Sidebar ממוקם נכון ב-RTL (מאומת):
```tsx
<aside className="... right-0 lg:right-auto">
```
ממוקם מצד ימין (`right-0`) ב-mobile — **תקין**.

---

## 9. בעיות שאינן RTL (Out of Scope — לתשומת לב)

- `components/ui/pagination.tsx` — טקסטים "Previous"/"Next" באנגלית (בעיית תרגום)
- שדות `dir="ltr"` לקוד מקור ו-pre — מכוון ונכון

---

## סיכום ממצאים לפי חומרה

### חמור (בעיות RTL ברורות — מאומתות)

| # | קובץ | שורה | בעיה |
|---|------|-------|-------|
| 1 | `components/ui/drawer.tsx` | 61 | `sm:text-left` בכותרת Drawer |
| 2 | `components/ui/alert-dialog.tsx` | 52 | `sm:text-left` בכותרת AlertDialog |
| 3 | `components/ui/pagination.tsx` | 69-89 | חצי ניווט הפוכים + טקסט באנגלית |
| 4 | `components/ui/enhanced-toast.tsx` | 162 | `fixed left-6` — פינה שגויה ב-RTL |
| 5 | `components/chat/chat-panel.tsx` | 399 | `fixed left-0 border-r` — פאנל בצד שגוי |
| 6 | `components/ui/calendar.tsx` | 103, 107, 111 | `range_start/end` rounded הפוך ב-RTL |
| 7 | `components/ui/alert.tsx` | 7 | אייקון `left-4` + `pl-7` — שמאל במקום ימין |

### בינוני

| # | קובץ | שורה | בעיה |
|---|------|-------|-------|
| 8 | `components/ui/accordion.tsx` | 29 | `text-left` על כפתורי Accordion |
| 9 | `components/status-transition.tsx` | 60, 71, 78, 94 | `ArrowRight` הפוך ב-RTL |
| 10 | `components/ui/breadcrumb.tsx` | 86 | `ChevronRight` כמפריד — לוודא ויזואלית |
| 11 | `pages/dashboard.tsx` | 1149-1169 | `text-left` בתאי טבלת "סטטוס יומי" |
| 12 | `pages/modules/procurement-competitors.tsx` | 394-396 | `text-left` בכותרות טבלה עבריות |
| 13 | `pages/bi/comparative-analytics.tsx` | 358-360 | `text-left` בכותרות טבלה |

### נמוך (לבחון בהקשר)

| # | קובץ | הערה |
|---|------|-------|
| 14 | `pages/modules/import-cost-calculator.tsx` | תאי ערכים `text-left` — ייתכן מכוון לניווט עין |
| 15 | שימוש ב-`mr-auto`/`ml-auto` | בדרך כלל עובד ב-RTL, לבדוק כל מקרה |

---

## קבצים מרכזיים לתיקון

```
artifacts/erp-app/src/components/ui/drawer.tsx          (sm:text-left → sm:text-right)
artifacts/erp-app/src/components/ui/alert-dialog.tsx    (sm:text-left → sm:text-right)
artifacts/erp-app/src/components/ui/pagination.tsx      (חצים + תרגום)
artifacts/erp-app/src/components/ui/enhanced-toast.tsx  (left-6 → right-6)
artifacts/erp-app/src/components/chat/chat-panel.tsx    (left-0/border-r → right-0/border-l)
artifacts/erp-app/src/components/ui/calendar.tsx        (range rounded)
artifacts/erp-app/src/components/ui/alert.tsx           (left-4/pl-7 → right-4/pr-7)
artifacts/erp-app/src/components/ui/accordion.tsx       (text-left → text-right)
artifacts/erp-app/src/components/status-transition.tsx  (ArrowRight → ArrowLeft)
```
