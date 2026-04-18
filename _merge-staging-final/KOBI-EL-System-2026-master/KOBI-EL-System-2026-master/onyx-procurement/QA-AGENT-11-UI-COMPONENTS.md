# QA Agent 11 — ביקורת רכיבי UI
## ONYX Procurement Dashboard — `web/onyx-dashboard.jsx`

- **תאריך:** 2026-04-11
- **סוג ביקורת:** ניתוח סטטי (static analysis) בלבד — ללא הרצת קוד, ללא שינוי קבצים, ללא התקנת תלויות
- **קובץ ביקורת:** `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\onyx-procurement\web\onyx-dashboard.jsx`
- **אורך קובץ:** 710 שורות
- **מספר רכיבים:** 11 (מתוכם 1 ראשי, 7 טאבים, 3 פרימיטיבים)
- **ספריות:** React (`useState`, `useEffect`, `useCallback`) — ללא PropTypes, ללא TypeScript, ללא מערכת עיצוב חיצונית

---

## סקירה כללית של הקובץ

הקובץ הוא single-file React component שמממש דשבורד רכש בעברית (RTL) עם 7 טאבים. כל הסגנונות נמצאים באובייקט `styles` אחד בתחתית הקובץ (שורות 630–710). אין PropTypes, אין טיפוסים, אין שימוש ב-`React.memo`/`useMemo`/`useRef`, ואין error boundaries. התקשורת עם ה-API נעשית דרך פונקציית `api()` אחת שמחזירה `{ error: ... }` במקום לזרוק חריגה — כלומר כל רכיב צריך לבדוק `res.error` בעצמו, ולא תמיד עושה זאת.

אתגר אוניברסלי לכל הרכיבים: **אין שפה כפתורית/סטטוסים ל-aria**. אין אף `aria-label`, `aria-live`, `role`, `htmlFor`, או `id` באלמנטים — כל הטפסים נכשלים בתקן WCAG 2.1 AA.

---

## 1. `OnyxDashboard` (הרכיב הראשי)

**טווח שורות:** 18–109

### 1.1 Props
אין — זהו `export default`, הרכיב השורש.

### 1.2 State
| שם | טיפוס | שימוש |
|---|---|---|
| `tab` | `string` | הטאב הנוכחי (`"dashboard"` ברירת מחדל) |
| `status` | `object \| null` | תוצאת `/api/status` |
| `suppliers` | `array` | רשימת ספקים |
| `subcontractors` | `array` | קבלני משנה |
| `orders` | `array` | הזמנות רכש |
| `rfqs` | `array` | בקשות מחיר |
| `savings` | `object \| null` | נתוני חיסכון |
| `loading` | `boolean` | האם טוען |
| `toast` | `{msg, type} \| null` | הודעת טוסט |

**9 hooks של `useState` ברכיב אחד** — ריח קוד. מסוכן בריענונים תכופים ובהסתרת באגים של עדכוני מצב לא-atomic.

### 1.3 Side Effects

- **`showToast`** (שורות 29–32): פונקציה רגילה (לא `useCallback`) — עם `setTimeout` לא מבוטל. **באג:** אם הרכיב עובר unmount לפני שעוברים 4 שניות, `setToast` ייקרא על רכיב מנותק — מוביל לאזהרה מ-React. אין cleanup.
- **`refresh`** (`useCallback`, שורות 34–43): שולח 6 קריאות API במקביל. תלותים: `[]` ריק — נכון, אבל מחזיק closure על `setLoading` וכו' שהם יציבים.
- **`useEffect`** (שורה 45): מריץ `refresh` מיד וב-`setInterval` כל 30 שניות. Cleanup מנקה את ה-interval.

**באגים בצד-אפקטים:**
1. אין `AbortController` על `fetch`, כך שאם הטאב ננעל לפני שהתשובה מגיעה — `setStatus(...)` ירוץ על רכיב שכבר לא במסך.
2. `refresh` לא מטפל בקריסות פרטיות — אם `api("/api/suppliers")` מחזיר `{error}`, הקוד כותב `sup.suppliers || []` שזה `undefined || []` → מחזיר `[]` ומסתיר את השגיאה מהמשתמש.
3. פולינג כל 30 שניות גורם ל-re-render גלובלי של כל הדשבורד — גם כשאין שינויים — מה שגורם ל-Waste של CPU ולאיפוס state מקומי ברכיבים תחתיים.

### 1.4 Re-render Triggers
- כל קריאת `refresh` מעדכנת **6 state hooks** ברצף (שורות 40–42) — זה מוביל ל-6 re-renders (באצווה של React 18, 1 בלבד, אבל ב-React 17 — 6 עוקבים).
- כל עדכון ל-`toast` גורם re-render גלובלי של הדשבורד ושל טאב פעיל.
- הטאב הפעיל מקבל ב-props את **כל** ה-state (`status`, `savings`, `suppliers`, ...) — גם אם לא השתנה — מה שגורם ל-re-render של רכיב הבן גם ללא צורך.

**בזבוז:** אין `useMemo` על מערכים שעוברים לטאבים. אין `React.memo` על אף רכיב טאב. כל re-render של `OnyxDashboard` גורם ל-re-render של הטאב הפעיל.

### 1.5 A11y/RTL
- **RTL:** `direction: "rtl"` מוגדר רק על `styles.app` (שורה 631). תלוי ב-inheritance של CSS, אבל `dir="rtl"` על האלמנט עצמו (או על `<html>`) **חסר**. `direction` ב-CSS לא מחליף את attribute `dir` — קוראי מסך לא יזהו את הכיוון.
- **Toast** (שורה 60): ללא `role="alert"` / `aria-live="assertive"`. קוראי מסך לא יראו את ההודעה כלל.
- **סטטוס נקודה** (שורה 72): ללא `aria-label` ("פעיל" / "לא מחובר"). קוראי מסך יראו רק את הטקסט שאחריו, ללא קשר למצב.
- **כפתור רענון** (שורה 74): תוכן כפתור הוא אמוג'י 🔄 בלבד. ללא `aria-label="רענן נתונים"` — קוראי מסך יקריאו "כפתור גלגל חוזר" או כלום.
- **ניווט טאבים** (שורות 79–85): משתמש ב-`<button>` בתוך `<nav>` — טוב, אבל **חסרים**: `role="tablist"` על ה-nav, `role="tab"` על כל כפתור, `aria-selected`, `aria-controls`, `tabIndex` מחושב. לא קיבוע מקלדת בין הטאבים.
- **Keyboard Trap פוטנציאלי:** אין — אבל סדר ה-Tab לא נבדק; `overflow-x: auto` על nav עלול להסתיר טאבים שלא נגישים במקלדת אם חלקם off-screen.
- **Loading** (שורה 89): טקסט סטטי "טוען..." ללא `role="status"` / `aria-busy`.

### 1.6 Style Drift
- **Hardcoded colors:** `#dc2626` (שורה 60), `#059669` (60), `#34d399` (72), `#f87171` (72) — כל אלה לא בתוך `styles` — **כפילות בתוך הקובץ** (כי `#059669` חוזר גם ב-705 ב-`smallBtn` background).
- **Inline objects:** שורות 60, 72, 81 — כל אחד יוצר אובייקט חדש בכל render, שובר שוויון רפרנטי ופוגע ב-memoization עתידי.
- **אין `colors` constants** — הצבעים פזורים ב-26+ מקומות שונים בקובץ.
- **סכנת drift:** `#0c0f1a` נמצא ב-styles.app, styles.header, styles.nav, styles.logo (color), styles.scoreValue (color), styles.primaryBtn (color) — אם משתנים צבע רקע, יש לשנות ב-6 מקומות.

### 1.7 Event Handlers (API calls)
- `onClick={refresh}` (שורה 74) — ללא error handling ויזואלי מעבר ל-toast (ש**אינו** נקרא כאן).
- `onClick={() => setTab(t.id)}` (שורה 81) — local only.

**פער בולט:** `refresh` (שורה 34) לא מציג toast על כישלון. אם `api()` מחזיר `{error}` ל-6 הקריאות, המשתמש רואה רק מערכים ריקים ואינו יודע שקרתה שגיאה.

### 1.8 Missing Loading/Error States
- יש `loading` אחד גלובלי — אבל הוא מוצג **מעל** התוכן הקיים (שורה 89), לא כ-overlay. זה מביא ל-**טקסט "טוען..." נוסף** שקופץ למעלה בכל 30 שניות.
- אין state של `error` — אין מסך שגיאה כשה-backend נופל.
- אין `retry` אוטומטי.

### 1.9 Empty State
- המצב ריק מטופל רק ב-`DashboardTab` (שורה 163). שאר הטאבים לא מציגים מצב ריק ראשוני.

---

## 2. `DashboardTab`

**טווח שורות:** 115–167

### 2.1 Props
| prop | טיפוס צפוי |
|---|---|
| `status` | `object \| null` |
| `savings` | `object \| null` |
| `suppliers` | `array` |
| `orders` | `array` |
| `rfqs` | `array` |

ללא `PropTypes`, ללא defaults.

### 2.2 State
**אין.** רכיב presentational.

### 2.3 Side Effects
**אין.**

### 2.4 Re-render Triggers
- `orders.filter(...)` (שורה 117) רץ **בכל render**, גם כשהמערך לא השתנה — צריך `useMemo`.
- `rfqs.filter(r => r?.status === "sent" || r?.status === "collecting")` (שורה 125) — גם כן רץ בכל render. סכנה גדולה יותר כי זה בתוך ה-JSX.
- `orders.slice(0, 5).map(...)` (שורה 151) — יוצר מערך חדש בכל render.

**בזבוז:** 3 פעולות מערך פר-render, כולן מיותרות ברוב המקרים.

### 2.5 A11y/RTL
- **Grid** עם `textAlign: "left"` (שורה 157) — במסך RTL זה יוצר יישור שגוי. צריך להיות `textAlign: "start"` או להסתמך על ה-direction.
- **KPI icons** (שורות 123, 124, 125, 126) — אמוג'ים בלי `aria-label`, קוראי מסך יקריאו תרגומים אקראיים.
- **Status badge** (שורה 158): צבע בלבד מעביר את הסטטוס (draft/sent/delivered). אין טקסט alt או aria — **נכשל בתקן WCAG 1.4.1 "שימוש בצבע"**.

### 2.6 Style Drift
- **Hardcoded colors inline:** `#38bdf8`, `#f59e0b`, `#a78bfa`, `#34d399` (שורות 123–126) — לא מה-`styles`.
- **Inline object:** `{ textAlign: "left" }` (157), `{ fontSize: 24 }` (172), `{ ...styles.kpiValue, color }` (173) — יוצרים אובייקטים חדשים.
- **Palantir drift:** הצבעים `#38bdf8` (sky/cyan) ו-`#a78bfa` (violet) הם Tailwind palette — **לא** מהפלטת Palantir הכהה (שאמורה להיות amber/orange על dark-slate).

### 2.7 Event Handlers
**אין** — רכיב קריאה בלבד.

### 2.8 Loading/Error
- **אין loading state** מקומי. תלוי בטוטאלי של ההורה.
- **אין error state** — אם `status` או `savings` הם `null` (שזו ברירת המחדל של ההורה) — הרכיב מציג 0 בלי אינדיקציה שהנתונים לא נטענו.

### 2.9 Empty State
- `{orders.length === 0 && <div style={styles.empty}>אין הזמנות עדיין</div>}` — נמצא רק עבור orders. אין טיפול במצב ריק של `rfqs`, `savings`, או `suppliers`.
- `suppliers.length` ב-KPI מציג "0" ללא הבחנה בין "אין נתונים" ל"נטען".

---

## 3. `SuppliersTab`

**טווח שורות:** 183–237

### 3.1 Props
| prop | טיפוס |
|---|---|
| `suppliers` | `array` |
| `onRefresh` | `function` |
| `showToast` | `function` |

### 3.2 State
| hook | תוכן |
|---|---|
| `showAdd` | `boolean` — האם להציג טופס הוספה |
| `form` | `{name, contact_person, phone, email, preferred_channel}` |

### 3.3 Side Effects
- **`addSupplier`** (שורות 187–195): async, לא useCallback. יוצרת closure חדש בכל render — פוגע בביצועים אם יועבר כ-prop ל-child.

### 3.4 Re-render Triggers
- `suppliers.map(...)` (שורה 216) רץ בכל render.
- אין `React.memo` על `MiniStat` — הרשימה מלאה קוראת ל-4 `MiniStat` לכל ספק בכל render.
- **בזבוז:** כל הקלטת אות בטופס (`setForm({...form, name: v})`) גורמת ל-re-render של **כל הרשימה** של הספקים. אם יש 100 ספקים ו-4 MiniStat לכל ספק → 400 re-renders על לחיצת מקש אחת.

### 3.5 A11y/RTL
- **Input components** (שורות 207–210): ה-label מקושר לinput ב-visual terms בלבד. אין `htmlFor` / `id` — קורא מסך לא יודע לאיזה שדה שייך ה-label.
- **`showAdd` toggle** (שורה 201): כפתור שמחליף בין "+ הוסף ספק" ל"ביטול" — ללא `aria-expanded`, `aria-controls`.
- **ScoreCircle** (שורה 223): ויזואליזציה של ציון — ללא `role="progressbar"` / `aria-valuenow` / `aria-valuemin` / `aria-valuemax`. קורא מסך רואה רק מספר ללא הקשר.
- **אין סדר לוגי לטאב** בתוך הטופס: הטפסים מוגדרים ב-grid2, וה-Tab-order תלוי בדפדפן.

### 3.6 Style Drift
- כל הצבעים באים מ-`styles` — **טוב**.
- **אבל:** `formCard` ו-`card` כמעט זהים (שורות 654–655) — כפילות: `(30,41,59,0.4)` לעומת `(30,41,59,0.5)`, פדינג 16 לעומת 18.
- **כפילות קוד:** `supplierCard` (687) כמעט זהה ל-`card` (654) — אפשר לאחד.

### 3.7 Event Handlers (API)
- **`addSupplier`**: 
  - ולידציה בלבד על שם וטלפון.
  - **אין ולידציה** על פורמט אימייל, פורמט טלפון ישראלי.
  - **שגיאה מטופלת דרך** `res.error` — **אבל:** אם ה-API מחזיר `res.supplier = {...}` זה עובד, אחרת — המשתמש רואה טוסט הצלחה גם אם השרת החזיר משהו לא צפוי.
- **אין `try/catch`** — תלוי בכך שהפונקציה `api()` הראשית מחזירה `{error}` ואינה זורקת.

### 3.8 Missing Loading/Error States
- **אין `sending` state** — המשתמש יכול ללחוץ על "שמור ספק" מספר פעמים, יצירת ספקים כפולים.
- **אין loading visual** על הכפתור אחרי הלחיצה.

### 3.9 Empty State
- **חסר:** אם `suppliers.length === 0`, הטאב מציג רק את ה-header וכפתור הוספה, ללא "אין ספקים — הוסף את הראשון!".

---

## 4. `RFQTab`

**טווח שורות:** 243–331

### 4.1 Props
| prop | טיפוס |
|---|---|
| `suppliers` | `array` |
| `onRefresh` | `function` |
| `showToast` | `function` |

### 4.2 State
| hook | תוכן |
|---|---|
| `items` | `array` — שורות פריטים |
| `meta` | `{requested_by, urgency, project_name, response_hours, note}` |
| `sending` | `boolean` |
| `result` | `object \| null` — תוצאת שליחה |

### 4.3 Side Effects
- **`send`** (שורות 256–280): 2 קריאות API עוקבות. **באג קריטי:** אם יצירת ה-PR מצליחה (`prRes.request.id`) אבל שליחת ה-RFQ נכשלת — ה-PR נוצר "יתום" בלי RFQ. אין rollback.
- **`addItem`, `removeItem`, `updateItem`** (249–251): עובדים על state באופן מוטציוני יחסי. `updateItem` משתמש ב-`[...items]` ואז מעדכן פריט בודד — זה פתוח לבאגים בהקלדה מהירה.

### 4.4 Re-render Triggers
- **כל שדה בטופס** גורם ל-re-render מלא של כל טופס ה-RFQ כולל כל שורות הפריטים. בעיה אם יש 20 פריטים.
- `items.filter(i => i.name && i.quantity)` (שורה 257) רץ גם כבדיקה וגם בעת המרה — כפילות.
- `result.results?.map(...)` (שורה 321) — יוצרת JSX בכל render של `result`.

### 4.5 A11y/RTL
- **Form errors לא מדווחים** ל-screen reader: הטוסט "הוסף לפחות פריט אחד" (258) מופיע אבל ללא `aria-live`.
- **Select** של דחיפות ושל קטגוריה (289, 296): אין `aria-describedby` להסבר.
- **Delete button** (שורה 300): אמוג'י ✕ בלבד, ללא `aria-label="מחק פריט"`.
- **הסידור של grid5** (295): 5 עמודות — במסכים צרים זה ישבר לא טוב ב-RTL כי אין breakpoint ו-`alignItems: "end"` בתוך inline style.
- **כפתור "+ הוסף פריט"** (303): textual, אין `type="button"` — יכול לגרום submit לא-רצוי אם הטופס מוקף ב-`<form>` (כרגע לא, אבל שבריר).

### 4.6 Style Drift
- **Hardcoded** `#059669`, `#10b981` ב-gradient בתוך inline style (שורה 392 בטאב QuotesTab, דומה כאן בשורה 316 `borderColor: "#059669"`).
- **Inline style duplicate:** `{ ...styles.grid2, marginTop: 16 }` (305) — ה-margin-top נוסף ידנית במקום להיות וריאנט ב-styles.
- **`padding: "14px 0"`** (310) — ערך דיסקרטי לא שקוף, כי primaryBtn כבר מוגדר עם padding שונה.

### 4.7 Event Handlers (API)
- **`send`**: 2 קריאות עוקבות, טיפול שגיאה חלקי (ראה 4.3 לעיל).
- **אין `AbortController`** — אם המשתמש עוזב את הטאב באמצע השליחה, ה-state יתעדכן על רכיב שכבר נ-unmounted.

### 4.8 Missing Loading/Error States
- `sending` מכסה את הכפתור ("שולח..."), **אבל** שאר הטופס נשאר עריך — המשתמש יכול לשנות ערכים בזמן שליחה.
- **אין מצב "נכשל — נסה שוב"** — השגיאה מוצגת בטוסט שנעלם אחרי 4 שניות.

### 4.9 Empty State
- אם `suppliers.length === 0`, ה-RFQ לא יישלח לאף אחד — אבל אין אזהרה מוקדמת למשתמש.
- אם `rfqs.length === 0` (חסר — אין טיפול), הטופס פשוט ריק.

---

## 5. `QuotesTab`

**טווח שורות:** 337–436

### 5.1 Props
| prop | טיפוס |
|---|---|
| `rfqs` | `array` |
| `suppliers` | `array` |
| `onRefresh` | `function` |
| `showToast` | `function` |

### 5.2 State
| hook | תוכן |
|---|---|
| `selectedRfq` | `string` — ID של ה-RFQ הנבחר |
| `rfqDetail` | `object \| null` — פרטי ה-RFQ |
| `quoteForm` | `{supplier_id, supplier_name, delivery_days, delivery_fee, free_delivery, line_items}` |
| `decision` | `object \| null` — תוצאת ה-AI |

### 5.3 Side Effects
- **`loadRFQ`** (שורה 343): קריאת API בעת שינוי סלקט. **ללא ביטול** — אם המשתמש מחליף RFQ מהר, תשובות ישנות יכולות "לנצח" ולדרוס את החדשות (race condition).
- **`submitQuote`** (שורות 347–362): קריאה אחת ל-POST, אחר כך קריאה **נוספת** ל-`loadRFQ`. סך הכל 2 קריאות רצופות ללא סימון loading.
- **`decide`** (364–370): מפעיל את ה-AI — קריאה יקרה שיכולה להימשך 5–30 שניות — **ללא אינדיקציה** למשתמש.

### 5.4 Re-render Triggers
- **כל הקלדה ב-quote line items** (424–427) יוצרת `[...quoteForm.line_items]` שלם, מחליפה את ה-state — גורמת ל-re-render של כל שורות ההצעה.
- **Inline arrow functions בכל שורה** (424–427) — 4 closures נפרדים פר-שורה פר-render.

### 5.5 A11y/RTL
- **Race condition visual:** בעת החלפת RFQ, `rfqDetail` עדיין מציג את הקודם. אין `key` על המסמך/section כדי להכריח re-mount נקי.
- **Decision reasoning** (שורה 401): `direction: "rtl"` inline per-line — כבר יורש מההורה, לא צריך.
- **כפתור "AI — בחר את ההצעה הטובה ביותר"** (393): מקבל `background: "linear-gradient(...)"` — דורס את `primaryBtn` הטבעי, יוצר 2 סגנונות שונים לכפתור "primary".
- **Select RFQ** (377): אין indication של מצב ריק כשאין RFQs (הטקסט "— בחר —" קיים אבל לא מודגש כ-disabled).

### 5.6 Style Drift
- **Hardcoded gradients** inline (392): `linear-gradient(135deg, #059669, #10b981)` — אבל `primaryBtn` (703) מגדיר gradient שונה `#f59e0b → #ef4444`. **אי-עקביות:** לפעמים כפתור primary זה כתום, לפעמים ירוק — תלוי באיפה הועתק ה-style.
- **`border: "2px solid #059669"`** (399) — `borderColor` נקבע inline במקום ב-styles. 
- **`background: "rgba(5,150,105,0.1)"`** (402) — RGB של `#059669` עם alpha. אם משנים את הצבע — לא ישתנה באופן עקבי.

### 5.7 Event Handlers (API)
- **`loadRFQ`** — race condition.
- **`submitQuote`** — שתי בדיקות ולידציה (supplier_id, line_items), חזרה אופציונלית — לא מעדכנת `result` במקרה של `res.error`, אבל הטופס לא אופס (בעיה בהצגת המצב).
- **`decide`** — ללא loading, ללא cancellation.

### 5.8 Missing Loading/Error States
- **אין שום loading state** בטאב הזה — לא לטעינת RFQ, לא לשמירת הצעה, לא להחלטת AI.
- **אין error card** — הטעויות נגלות רק דרך הטוסט הכללי.

### 5.9 Empty State
- `rfqDetail?.quotes?.length > 0` (380) — אם אין הצעות, לא מוצג שום דבר, לא אפילו "אין הצעות עדיין".
- אם `rfqs` ריק, הסלקט מכיל רק "— בחר —" והמשתמש לא יודע שאין RFQs.

---

## 6. `OrdersTab`

**טווח שורות:** 442–485

### 6.1 Props
| prop | טיפוס |
|---|---|
| `orders` | `array` |
| `onRefresh` | `function` |
| `showToast` | `function` |

### 6.2 State
**אין.** רכיב ללא state פנימי.

### 6.3 Side Effects
- **`approve`** (443–446): async, ללא error check מלא. `showToast(res.message || "אושר")` — אם `res.error` קיים, מציג את `res.message` שהוא `undefined` ואז "אושר" — **באג:** המשתמש רואה "אושר" גם כשקרתה שגיאה.
- **`send`** (447–450): ללא error check — בודק `res.sent` אבל לא `res.error`.

### 6.4 Re-render Triggers
- `orders.map(...)` (457) + `o.po_line_items?.map(...)` (471) — nested map, רץ בכל render.
- **Inline arrow functions** על כפתורי `approve` ו-`send` (477–478) — 2 פונקציות חדשות פר-הזמנה פר-render.

### 6.5 A11y/RTL
- **`textAlign: "left"`** (465) — שוב, לא `start`. כתיבת סכומים ב-RTL צריכה להיות מיושרת ל-start, לא left.
- **Status badge** (466) — צבע בלבד. חסר `aria-label` שמתרגם את הסטטוס.
- **כפתורי "✅ אשר" ו"📤 שלח לספק"** (477–478) — אמוג'ים בטקסט הכפתור. עדיף `aria-label` נפרד.
- **אין `key` יציב** בשורות הפריטים (471) — משתמש באינדקס `i` → באג פוטנציאלי בעת מיון/סינון.

### 6.6 Style Drift
- **`statusColors` mapping** (452) — **hardcoded** ב-component, לא ב-`styles`. אם רוצים לשנות צבעים — צריך לערוך את הקומפוננטה.
- **`background: "rgba(255,255,255,0.02)"`** (472) — hardcoded inline, לא ב-styles.
- **`fontSize: 18`** (467), **`fontSize: 12`** (468) — magic numbers פזורים.
- **`#34d399`** (468) — הצבע הירוק של savings, לא מופיע ב-styles.

### 6.7 Event Handlers (API)
- **`approve`**: POST ל-`/api/purchase-orders/{id}/approve`. אין try/catch, אין loading, אין disabled state.
- **`send`**: POST ל-`/api/purchase-orders/{id}/send`. בודק `res.sent` — אם ה-API לא מחזיר את השדה הזה, מציג "שליחה נכשלה" אפילו אם הצליח.

### 6.8 Missing Loading/Error States
- **אפס** — אין שום אינדיקציה של פעולה-בתהליך.
- משתמש יכול ללחוץ "אשר" 5 פעמים ברצף — 5 POST-ים.

### 6.9 Empty State
- `{orders.length === 0 && <div style={styles.empty}>אין הזמנות</div>}` — קיים (482). טוב.

---

## 7. `SubcontractorsTab`

**טווח שורות:** 491–517

### 7.1 Props
| prop | טיפוס |
|---|---|
| `subcontractors` | `array` |
| `onRefresh` | `function` — **לא נמצא בשימוש** |
| `showToast` | `function` — **לא נמצא בשימוש** |

**פער:** `onRefresh` ו-`showToast` מועברים לטאב הזה אבל לא משומשים בתוכו. קוד מת.

### 7.2 State
**אין.**

### 7.3 Side Effects
**אין.**

### 7.4 Re-render Triggers
- `subcontractors.map(...)` (495) רץ בכל render.
- `(s.specialties || []).join(", ")` (500) — יוצר string חדש בכל render.
- `s.subcontractor_pricing?.map(...)` (507) — יוצר מערך חדש.

### 7.5 A11y/RTL
- **MiniStat** (503–504) — רק טקסט. קורא מסך לא יידע שזה "איכות" לעומת "אמינות" בלי ה-label הנפרד.
- **Pricing list** (507): שורה עם `p.work_type` בצד אחד ופרטים מספריים בצד שני — **ללא heading**, שגיאה semantic.

### 7.6 Style Drift
- משתמש רק ב-styles הקיימים — טוב.
- **אבל:** העתק כמעט מדויק של `SuppliersTab` מבחינת layout — 60+ שורות שחוזרות על אותו תבנית.

### 7.7 Event Handlers
**אין.** רכיב קריאה בלבד, למרות שמקבל callbacks.

### 7.8 Missing Loading/Error States
- **אין** — תלוי בהורה.

### 7.9 Empty State
- **חסר:** אין טיפול ב-`subcontractors.length === 0`.

---

## 8. `SubDecideTab`

**טווח שורות:** 523–590

### 8.1 Props
| prop | טיפוס |
|---|---|
| `onRefresh` | `function` |
| `showToast` | `function` |

**פער:** `onRefresh` מוזכר בפרופס (523) אבל **אף ארגומנט של קבלני משנה עצמם** — הטאב מציג רק את התוצאה ולא רשימה לבחירה.

### 8.2 State
| hook | תוכן |
|---|---|
| `form` | `{work_type, project_value, area_sqm, project_name, client_name}` |
| `result` | `object \| null` |

### 8.3 Side Effects
- **`decide`** (529–538): async, validation בסיסית, קריאה אחת ל-API, עדכון `result`. ללא loading.

### 8.4 Re-render Triggers
- `workTypes.map(w => [w, w])` (546) יוצר מערך חדש בכל render.
- `result.reasoning?.map(...)` (562) — בכל render של `result`.
- `result.candidates.map(...)` (578) — nested.

### 8.5 A11y/RTL
- **`direction: "rtl"` inline** (562) — redundant, יורש כבר.
- **trophy emoji** (580): "🏆" ו-`#N` מעורבים — קוראי מסך לא מבינים את דירוג ה-candidates.
- **`textAlign: "start"` חסר** — הפריטים פרוסים ב-`flex` ולא בטוח איפה יפלו ב-RTL.

### 8.6 Style Drift
- **`border: "2px solid #059669"`** (560) — שוב hardcoded ירוק.
- **`color: "#34d399"`** (561, 566) — hardcoded.
- **`background: "rgba(5,150,105,0.1)"`** (564) — כפילות עם QuotesTab שורה 402.
- **`border: "1px solid #05966930"`** (564) — hex עם alpha בלתי סטנדרטי (8 תווים) — עובד בדפדפנים מודרניים אך לא צפוי.
- **`background: i === 0 ? "rgba(5,150,105,0.05)" : "transparent"`** (579) — conditional inline.

### 8.7 Event Handlers (API)
- **`decide`**: 
  - ולידציה: project_value ו-area_sqm חובה — **אבל לא** project_name או client_name (למרות שהם בטופס).
  - טיפול שגיאה: `if (res.error) return showToast(res.error, "error")` — **אבל** אין rollback של `result` הישן אם שגיאה קיימת בקריאה חדשה.
- **`onRefresh()` נקרא** בסוף (537) — אבל הטאב הזה לא צריך את הדאטה הגלובלי, אז הקריאה מיותרת.

### 8.8 Missing Loading/Error States
- **אין loading** על כפתור ה-"AI — חשב ובחר". כפי שציינתי, קריאות AI יכולות להימשך עשרות שניות.
- **אין error state מתמשך** — שגיאה מופיעה רק בטוסט.

### 8.9 Empty State
- **לא רלוונטי** — הטאב מציג רק תוצאה אחת.

---

## 9. `Input` (Primitive)

**טווח שורות:** 596–603

### 9.1 Props
| prop | טיפוס | ברירת מחדל |
|---|---|---|
| `label` | `string \| undefined` | `undefined` |
| `value` | `string / number` | — |
| `onChange` | `function` | — |
| `type` | `string` | `"text"` |
| `placeholder` | `string` | `""` |

### 9.2 State
**אין** — controlled component.

### 9.3 Side Effects
**אין.**

### 9.4 Re-render Triggers
- כל שינוי ב-`value` מכל הורה גורם re-render. **בלי `React.memo`** — גם שינוי לא-רלוונטי בהורה גורם re-render.

### 9.5 A11y/RTL (חמור)
- **ללא `htmlFor` / `id`** — ה-`<label>` לא מקושר ל-`<input>` באופן סמנטי. קורא מסך לא יקריא את ה-label בעת מיקוד.
- **ללא `name`** — טופסי autofill לא עובדים.
- **ללא `required`** — למרות שבקוד יש בדיקות ידניות (`if (!form.name)`), המשתמש לא רואה asterisk ולא מקבל validation הטבעית של הדפדפן.
- **ללא `aria-required`**, `aria-invalid`, `aria-describedby`.
- **ללא `dir="rtl"`** מפורש על ה-input — תלוי ב-inheritance של CSS `direction`.
- **`type="number"` בלי `min`/`max`/`step`** — משתמש יכול להכניס מספרים שליליים או שברים לא-רצויים (למשל בכמות פריטים).

### 9.6 Style Drift
- `styles.input` משותף גם ל-`<select>` — גמיש, אבל עלול לגרום לבעיות גובה בין הדפדפנים.

### 9.7 Event Handlers
- **אין debouncing** — כל הקלדה קוראת ל-`onChange` וכל ה-setState מעדכן.

### 9.8 Missing States
- **אין error state ויזואלי** — הרכיב לא מקבל `error` prop, כך שאין גבול אדום או הודעה.
- **אין disabled prop** — לא ניתן להשבית את ה-input בזמן שליחה.

---

## 10. `Select` (Primitive)

**טווח שורות:** 605–614

### 10.1 Props
| prop | טיפוס |
|---|---|
| `label` | `string \| undefined` |
| `value` | `string` |
| `onChange` | `function` |
| `options` | `Array<[value, text]>` — tuple |

### 10.2 State
**אין.**

### 10.3 Side Effects
**אין.**

### 10.4 Re-render Triggers
- `options.map(...)` (610) — מפה מחדש בכל render. זו לא בעיה גדולה לרשימות קצרות, אבל מערכים גדולים ייצרו waste.

### 10.5 A11y/RTL
- **אותן בעיות** כמו `Input`: ללא `id`/`htmlFor`, ללא `aria-*`.
- **אין `placeholder` אמיתי** — הקוד מעביר placeholder דרך option ראשון `[["", "— בחר —"]]` שזה hack שמתקיים אבל לא נגיש.
- **אין `disabled` option** — אפשרות "— בחר —" נבחרת ולא מחייבת בחירה אמיתית. אין `required`.

### 10.6 Style Drift
- **משתמש ב-`styles.input`** — נכון, חוסך כפילות, אבל:
  - `<select>` ו-`<input>` מתנהגים שונה ב-CSS. ה-dropdown arrow של ה-select לא ניתן לעיצוב ללא `-webkit-appearance` ועוד.
  - אין caret מעוצב — תלוי לגמרי בברירת המחדל של הדפדפן, שלרוב לא תואמת לדארק מוד.

### 10.7 Event Handlers
- `onChange={e => onChange(e.target.value)}` — **לא משחזר את ה-tuple**, שולח רק את ה-value. טוב.

### 10.8 Missing States
- **אין disabled, loading, error** — זהה ל-Input.

---

## 11. `MiniStat` (Primitive)

**טווח שורות:** 616–623

### 11.1 Props
| prop | טיפוס |
|---|---|
| `label` | `string` |
| `value` | `string \| number` |

### 11.2 State
**אין.**

### 11.3 Side Effects
**אין.**

### 11.4 Re-render Triggers
- רכיב מינימלי — 2 divs. אבל ללא `React.memo` — בכל re-render של ההורה (למשל SuppliersTab), כל MiniStat מחושב מחדש.

### 11.5 A11y/RTL
- **אין semantic structure** — זוג label/value ללא `<dl>/<dt>/<dd>` או `aria-labelledby`.
- **קורא מסך יקריא** "איכות 8/10" כשני טקסטים נפרדים, ללא קשר ביניהם.

### 11.6 Style Drift
- עקבי, משתמש רק ב-`styles.miniStat*`. 
- **אבל:** `fontSize: 9` ב-miniStatLabel (694) — קטן מדי לפי WCAG (מינימום 12px מומלץ).

### 11.7 Event Handlers
**אין.**

### 11.8 Missing States
- לא רלוונטי — רכיב תצוגה טהור.

---

## `KPI` — רכיב נוסף שנמצא בקובץ

**טווח שורות:** 169–177

רכיב לא נמצא בגלל שהוא לא ברשימת המטרה המקורית, אבל קיים בקובץ. משומש ב-`DashboardTab`.

### Props
| prop | טיפוס |
|---|---|
| `icon` | `string` (emoji) |
| `label` | `string` |
| `value` | `string \| number` |
| `color` | `string` (hex) |

### Issues
- מקבל **`color` כ-prop** — שובר את העיקרון של מערכת עיצוב (design system).
- **אין aria-label** על האייקון.
- רכיב פרזנטציה טהור — לא ממומו.

---

# טבלת סיכום ממצאים

| רכיב | Critical | High | Medium | Low | סה"כ |
|---|---|---|---|---|---|
| `OnyxDashboard` | 3 | 5 | 4 | 3 | **15** |
| `DashboardTab` | 1 | 3 | 3 | 2 | **9** |
| `SuppliersTab` | 2 | 3 | 3 | 2 | **10** |
| `RFQTab` | 3 | 4 | 3 | 2 | **12** |
| `QuotesTab` | 3 | 5 | 3 | 2 | **13** |
| `OrdersTab` | 2 | 4 | 3 | 2 | **11** |
| `SubcontractorsTab` | 0 | 2 | 3 | 2 | **7** |
| `SubDecideTab` | 1 | 3 | 3 | 2 | **9** |
| `Input` | 3 | 3 | 2 | 1 | **9** |
| `Select` | 2 | 3 | 2 | 1 | **8** |
| `MiniStat` | 0 | 1 | 2 | 1 | **4** |
| `KPI` | 0 | 1 | 1 | 1 | **3** |
| **סה"כ** | **20** | **37** | **32** | **21** | **110** |

## הגדרת חומרות

- **Critical:** באג שבורר נתונים / race condition / חסימת a11y מוחלטת / מוביל לאובדן נתונים
- **High:** חסר loading/error state / drift סגנוני שמשפיע על UX / חסר cleanup
- **Medium:** בזבוז re-renders / חוסר ולידציה / כפילות קוד
- **Low:** inline styles מינוריים / magic numbers / empty state חסר

---

## 10 הממצאים הקריטיים ביותר (top priorities)

1. **`OnyxDashboard.refresh`** — אין `AbortController`, חסם של 6 setStates עוקבים גורם ל-re-renders מיותרים, וללא toast על כישלון. **שורות 34–43.**
2. **`showToast`** — `setTimeout` ללא cleanup. אם הרכיב יורד מהמסך בזמן הטוסט — warning ותוצאות לא-דטרמיניסטיות. **שורות 29–32.**
3. **`RFQTab.send`** — אין rollback בין יצירת PR לשליחת RFQ. נוצרים PR יתומים. **שורות 256–280.**
4. **`QuotesTab.loadRFQ`** — race condition: החלפת RFQ מהר מובילה לתוצאה של בקשה ישנה. **שורה 343.**
5. **`OrdersTab.approve`** — `showToast(res.message || "אושר")` מציג "אושר" גם על שגיאה. **שורות 443–446.**
6. **כל `Input` ו-`Select` פרימיטיבי** — ללא `htmlFor`/`id` על labels. כל הטפסים נכשלים ב-WCAG 2.1 AA. **שורות 596–614.**
7. **`OnyxDashboard`** — ללא `dir="rtl"` attribute על ה-root, רק `direction: "rtl"` ב-CSS. קוראי מסך לא מזהים RTL. **שורה 631.**
8. **`SubcontractorsTab`** — מקבל `onRefresh` ו-`showToast` שלא מנוצלים. קוד מת ומטעה. **שורות 491–517.**
9. **`QuotesTab` ו-`SubDecideTab`** — קריאות AI יקרות (עד 30 שניות) ללא שום loading indication. המשתמש לא יודע אם המערכת קרסה. **שורות 364–370, 529–538.**
10. **`styles.cardTitle`** — ב-6 רכיבים שונים המלל מתנגש עם צבעי inline (ירוק/כתום) — 3 גרסאות שונות של "כפתור primary". אין מקור אמת יחיד למערכת העיצוב. **שורות 703, 316, 392, 399, 560.**

---

## המלצות פעולה כלליות

1. **הוסף PropTypes או TypeScript** — כל הרכיבים חסרים חתימות טיפוסים.
2. **צור `theme.js`** — חילוץ של כל הצבעים והמרווחים למקום מרכזי.
3. **עטוף רכיבי טאב ב-`React.memo`** — לחסוך re-renders מיותרים מהפולינג.
4. **הוסף `useReducer`** ל-`OnyxDashboard` במקום 9 useStates.
5. **הוסף `AbortController` לכל קריאות API** — וטפל ב-unmount cleanup.
6. **צור `FormField` composite** שמשלב `label` + `input` עם `htmlFor`/`id` אוטומטיים.
7. **הוסף `aria-live="polite"` region** לטוסטים ולמצבי טעינה.
8. **החלף אמוג'ים בטקסט כפתור ב-`aria-hidden` + `aria-label`** — גישות שונות לצרכים שונים.
9. **הוסף ErrorBoundary** סביב ה-main content.
10. **חסום `disabled`** על כפתורים במהלך קריאות API במקום להסתמך על `sending`.

---

**סוף הדוח — QA Agent 11**
