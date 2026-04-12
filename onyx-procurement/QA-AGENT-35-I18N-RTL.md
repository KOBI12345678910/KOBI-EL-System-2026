# QA-AGENT-35 — i18n / RTL / Localization Audit

**Agent:** #35
**Dimension:** i18n / RTL / Localization (Static Analysis Only)
**Date:** 2026-04-11
**Scope:** `web/onyx-dashboard.jsx` (710 שורות), `server.js` (מחרוזות משתמש)
**Status:** לא-חופף ל-QA-WAVE1-DIRECT-FINDINGS ולא-חופף ל-Agent 12 (UX/A11y).
ב-Agent 12 מוזכרות רק שתי הערות שטחיות (#1 Hebrew RTL "חלקי", #12 Number formatting "חלקי"). דו"ח זה הוא ה-deep-dive המלא.

---

## 1. Executive Summary — בעברית

המערכת **עברית-RTL בלבד**, אבל ה-i18n/RTL מיושמת **באופן חלקי ושביר** — רק על ידי `direction:"rtl"` אחד ברכיב שורש (שורה 631). אין HTML shell, אין `<html lang="he" dir="rtl">`, אין CSS logical properties, אין קובץ מחרוזות חיצוני (`messages.he.json`), אין טיפול ב-bidi עבור שמות ספקים באנגלית, וה-badges של סטטוסים מציגים מחרוזות אנגלית raw (`draft`,`approved`,`delivered`) עם `textTransform:"uppercase"` בתוך UI עברי. הוספת תמיכה באנגלית בעתיד **דורשת שכתוב מלא של כל ה-710 שורות** — אין abstraction layer.

**חומרה כוללת:** בינונית-גבוהה. המערכת **עובדת** היום לעברית, אבל כל שינוי בעתיד (לוקליזציה, תמיכה בערבית, אנגלית, תווית לקוח באנגלית) ייפגע קשות.

---

## 2. ממצאים — 15 סעיפים מפורטים

### I18N-01 — אין `<html dir="rtl">` ולא `lang="he"` [HIGH]
**מיקום:** אין קובץ `index.html` בפרויקט (נבדק ב-Glob — "No files found" על `**/*.html`).
**מצב:** ה-JSX מיועד להיות מורכב לתוך shell חיצוני (Vite/Next) שלא קיים בריפו. ה-RTL מיושם **רק** דרך inline style:
```jsx
// שורה 631:
app: { minHeight: "100vh", background: "#0c0f1a", color: "#e2e8f0",
       fontFamily: "'Rubik', sans-serif", direction: "rtl" },
```
**בעיות:**
- `<body>` עצמו נטען LTR (ברירת מחדל). סקרולבר, toast (`position: fixed`), dropdown של `<select>`, date pickers של הדפדפן — **ייפתחו מצד שמאל**, לא מצד ימין.
- Screen readers לא יזהו את השפה כעברית (חסר `lang="he"`). ה-ARIA / TTS ינסו להקריא כאנגלית.
- ה-Toast ב-שורה 60 ממוקם `left: "50%", transform: "translateX(-50%)"` — למזלם עבד, אבל זה אקראי.
**פתרון נדרש:**
```html
<html lang="he" dir="rtl">
  <body>...
```

### I18N-02 — Physical CSS properties במקום Logical properties [HIGH]
**מיקום:** הסטיילים ב-`styles` (שורות 630-710).
**ממצאים ספציפיים:**
| שורה | קוד | בעיה |
|---|---|---|
| 157 | `<div style={{ textAlign: "left" }}>` (בדשבורד) | טקסט מחיר/סטטוס מיושר **ימינה** של קונטיינר LTR, **שמאלה** ב-RTL — הכוונה הייתה "הצד ההפוך מהרגיל" אבל הקידוד physical |
| 465 | `<div style={{ textAlign: "left" }}>` (בהזמנות) | אותה בעיה |
| 651,660,671,682,693 | `textAlign: "center"` | אלה OK — center לא תלוי כיוון |
| 634 | `padding: "16px 20px"` בheader | OK (symmetric) |
| 645 | `padding: "8px 16px"` בnav | OK (symmetric) |
| 699 | `marginBottom: 4` | OK (אין horizontal margins problematic) |

**אבל** אין שימוש ב-`paddingInlineStart`, `marginInlineEnd`, `insetInlineStart`, `textAlign: "start"/"end"`. כל שינוי כיוון בעתיד ידרוש החלפת **כל** ה-`textAlign: "left"` ל-`right` ידנית.

**המלצה:** החלף לחלוטין:
```js
// במקום:
textAlign: "left"
// השתמש:
textAlign: "end"  // או "start" לפי הכוונה הסמנטית
```
זה עובד אוטומטית גם ב-LTR וגם ב-RTL.

### I18N-03 — הצמדה רפטטיבית של `direction: "rtl"` ב-JSX [MEDIUM]
**מיקום:** שורות 401, 562.
```jsx
// שורה 401 (QuotesTab - reasoning):
{decision.reasoning?.map((r, i) =>
  <div key={i} style={{ ...styles.listSub, padding: "2px 0", direction: "rtl" }}>{r}</div>
)}
// שורה 562 (SubDecideTab - reasoning):
<div key={i} style={{ ...styles.listSub, padding: "2px 0", direction: "rtl" }}>{r}</div>
```
**הבעיה:** מאחר ו-`direction:"rtl"` מוגדר כבר ברמת `.app` בשורש (שורה 631), ההוספה כאן **מיותרת** — אלא אם כן המפתח ציפה שה-reasoning strings (שכוללים טקסט עברי, מספרים, `₪`, `|`, `%`, אמוג'ים) יתנהגו באופן מיוחד. זה **סמפטום לבעיית bidi** (ראה סעיף I18N-09) — המפתח שם לב שהטקסט "נשבר" וכיסה נקודתית.

### I18N-04 — ספרות: Western numerals — **מאומת** [OK]
**ממצא חיובי:** כל המספרים במערכת הם Western Arabic numerals (0-9). אין ניסיון להשתמש ב-Hebrew numerals (א'-ת'). זה נכון — עברית מודרנית משתמשת ב-Western numerals. **אין בעיה.**

### I18N-05 — Currency: `₪` placement [MEDIUM — bidi issue]
**תופעה:** ברוב ה-codebase ה-`₪` מופיע **לפני** המספר:
```jsx
// onyx-dashboard.jsx שורה 126:
value={`₪${(savings?.total_savings || 0).toLocaleString()}`}
// שורה 159:
<div style={styles.listAmount}>₪{(o.total || 0).toLocaleString()}</div>
```
**Israeli standard:** ב-ISO 4217 ו-CLDR, הפורמט הישראלי הוא `123,456.78 ₪` — הסימן **אחרי** המספר בתבנית עברית רשמית. אבל המפתחים בחרו `₪123,456` — שזה פורמט נפוץ בעולם ה-web הישראלי.
**הבעיה האמיתית אינה ה-placement אלא ה-bidi:** כאשר טקסט RTL מכיל מספר עם סימן מטבע, ה-Unicode Bidirectional Algorithm עלול להציג את התוצאה ב-**סדר לא צפוי**. דוגמה:
```
"חיסכון: ₪1,234 (12%)"
```
יכול להיראות ב-browser מסוים כ-`חיסכון: 1,234₪ (%12)` אם אין LRM/RLM markers או `<bdi>` wrappers.
**המלצה:** עטוף כל ערך מטבע/מספר ב-`<bdi>` או השתמש ב-`Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS' })` שמחזיר את הפורמט הנכון עם המטבע ב-placement הנכון אוטומטית.

### I18N-06 — Date format [OK בינוני]
**ממצא:** משתמשים consistently ב-`toLocaleDateString("he-IL")`:
- `onyx-dashboard.jsx` שורות 155, 319, 462
- `server.js` שורות 270, 642

`toLocaleDateString("he-IL")` מחזיר `DD.M.YYYY` (לדוגמה `11.4.2026`) — תצורת ברירת המחדל של Intl לישראל. **אבל:**
1. Agent 15 כבר הציב דגל ש-timezone אינו נעול ל-`Asia/Jerusalem` — דו"ח זה **לא חוזר** על אותה ממצא.
2. אין consistency format בין `.` ל-`/`. המפתח לא בחר ידנית — Intl בוחר.
3. **ללא Fallback אם הדפדפן לא תומך ב-`he-IL` locale** (רלוונטי ב-embedded WebViews ישנות). **לא נבדק.**

### I18N-07 — Time format [LOW]
**מיקום:** `server.js` שורה 270.
```js
`דדליין: ${deadline.toLocaleDateString('he-IL')} ${deadline.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}`
```
**ממצא:** `hour: '2-digit', minute: '2-digit'` ללא `hourCycle`. ב-`he-IL` ברירת המחדל היא 24h (לפי CLDR) — **נכון לישראל**. אבל ייתכנו variations:
- Chrome 113+: `14:30`
- Safari ישן: `2:30 PM` (נדיר ב-`he-IL` אבל ייתכן)

**המלצה:** לקבע `hourCycle: 'h23'` או `hour12: false` במפורש.

**בעיה נוספת:** שימוש ב-`toLocaleString("he-IL")` ב-`onyx-dashboard.jsx` שורה 319 — הפורמט כולל תאריך **ושעה** יחד בלי הגדרה. ה-output יהיה מעורב של תאריך+שעה ב-locale format, ללא control על הרכיבים.

### I18N-08 — Status badges: English strings בתוך UI עברי [HIGH]
**מיקום:** שורות 158, 452, 466, 681.
```jsx
// שורה 452 (OrdersTab):
const statusColors = {
  draft: "#71717a", pending_approval: "#f59e0b", approved: "#2563eb",
  sent: "#8b5cf6", confirmed: "#059669", delivered: "#34d399",
  closed: "#6b7280", cancelled: "#dc2626"
};

// שורה 466:
<div style={{ ...styles.badge, background: statusColors[o.status] || "#71717a" }}>
  {o.status}  // ← מציג raw English: "draft", "pending_approval", "delivered"
</div>

// שורה 681 (styles):
badge: { ..., textTransform: "uppercase" }  // ← "DRAFT", "PENDING_APPROVAL"
```
**בעיות:**
1. המשתמש העברי רואה `PENDING_APPROVAL` בתוך UI עברי — חוויה זרה.
2. `textTransform: "uppercase"` לא עובד על עברית (אין אותיות גדולות בעברית) — אבל עובד על האנגלית של ה-status, מה שמדגיש עוד יותר את הבעיה.
3. `snake_case` מוצג למשתמש קצה (underscores).
4. אין מפוי status → Hebrew label.

**פתרון:**
```jsx
const STATUS_LABELS_HE = {
  draft: "טיוטה",
  pending_approval: "ממתין לאישור",
  approved: "אושר",
  sent: "נשלח",
  confirmed: "אושר ע\"י ספק",
  delivered: "סופק",
  closed: "סגור",
  cancelled: "בוטל"
};
// ואז:
<div style={styles.badge}>{STATUS_LABELS_HE[o.status] || o.status}</div>
```

### I18N-09 — Bidi issues: שמות ספקים באנגלית בתוך טקסט עברי [HIGH]
**תופעה:** המערכת היא עבור חברה ישראלית ("טכנו כל עוזי") אבל ייתכן (ואף סביר) שחלק משמות הספקים יהיו **באנגלית** ("Schneider Electric", "Bosch", "ABB Ltd"). כאשר שם כזה משובץ במשפט עברי:
```
"הצעה מ-Bosch: ₪12,345"
"נבחר: Schneider Electric — חיסכון ₪5,670 (15%)"
```
ה-Unicode Bidi Algorithm מחליט איך לסדר את הצירוף. ללא `<bdi>` wrappers או LRM markers (`\u200E`), ה-output עלול להיות מעורבב:
- סימני פיסוק (`-`, `:`, `—`) מקבלים "weak direction" ומתנהגים לפי הקונטקסט.
- מספרים סמוכים למטבע ולאותיות לועזיות יוצרים "directional run transitions" לא צפויות.
- האמוג'ים (🏆, 💰, 📤) הם "neutral direction" — קופצים בין צדדים.

**מיקומים קריטיים:**
- `server.js` שורה 331: `message: \`RFQ ${rfqId} נשלח ל-${results...}\``
- `server.js` שורה 513: \`${tag} ${s.supplier_name}: ₪${s.total_price...}\` (בתוך reasoning)
- `server.js` שורה 770: אותו הדבר ל-subcontractor
- `onyx-dashboard.jsx` שורות 392, 401, 562: הצגת reasoning

**פתרון:**
```jsx
// במקום:
<div>{r}</div>
// השתמש:
<div dir="auto"><bdi>{r}</bdi></div>
```
או לעטוף רק את ה-supplier name:
```jsx
<span>הצעה מ-<bdi>{supplier.name}</bdi>: ₪{total}</span>
```

### I18N-10 — Hard-coded Hebrew strings — 100% [HIGH עבור עתיד]
**ממצא:** **כל** המחרוזות למשתמש הוגדרו inline ב-JSX/JS. דוגמאות:
- `onyx-dashboard.jsx` שורה 48: `tabs = [{ label: "דשבורד" },{ label: "ספקים" },...]`
- שורה 89: `טוען...`
- שורה 188: `"שם וטלפון חובה"`
- שורה 253: `categories = ["ברזל", "אלומיניום", "נירוסטה", ...]`
- `server.js` שורה 251: `error: \`לא נמצאו ספקים לקטגוריות: ${cats.join(', ')}\``
- `server.js` שורה 444: `error: 'אין הצעות מחיר — לא ניתן לקבל החלטה'`
- `server.js` שורה 725: `error: \`אין קבלנים ל-${work_type}\``
- `server.js` שורה 728: `error: 'אין קבלנים זמינים'`

**בעיה נוספת:** ה-categories וה-workTypes הם **מפתחות DB בעברית** (`"ברזל"`, `"מעקות_ברזל"`). זה מעמיק את הבעיה: אי אפשר פשוט לתרגם את ה-label — המפתח עצמו בעברית, והוא נשמר ב-DB ומועבר ב-API.

**עלות refactoring לעתיד:** **גבוהה מאוד.**

**פתרון:**
1. ליצור `messages.he.json`:
```json
{
  "tabs.dashboard": "דשבורד",
  "tabs.suppliers": "ספקים",
  "common.loading": "טוען...",
  "error.name_phone_required": "שם וטלפון חובה"
}
```
2. להחליף את המפתחות ב-DB ל-enum אנגלי: `IRON`, `ALUMINUM`, `STAINLESS_STEEL`... ולהציג רק את ה-label המתורגם.
3. להשתמש ב-`react-i18next` / `react-intl` / `lingui`.

### I18N-11 — WhatsApp message templates — Hebrew approval status [MEDIUM]
**מיקום:** `server.js` שורות 262-276 (RFQ) ו-636-658 (PO).

**RFQ template:**
```js
const messageText = [
  `שלום רב,`,
  ``,
  `חברת טכנו כל עוזי בע"מ מבקשת הצעת מחיר:`,
  ...
  `דדליין: ${deadline.toLocaleDateString('he-IL')} ${deadline.toLocaleTimeString('he-IL', {...})}`,
  ...
  `נא לציין: מחיר ליחידה, סה"כ, משלוח, זמן אספקה, תנאי תשלום.`,
  `בברכה, טכנו כל עוזי בע"מ`,
].filter(Boolean).join('\n');
```
**סוגיות:**
1. **WhatsApp Business API דורש Approved Templates** לתבניות שיווק/notification/HSM. הטקסט הזה נראה כטקסט חופשי (`type: 'text'`) — שעובד **רק בתוך חלון 24 שעות** של שיחה יזומה מהלקוח. **ישראלי ספק לא יוזם שיחה למערכת הזאת.** שליחת RFQ יזומה **תיכשל** ב-production אם לא תיעשה דרך Template approved.
2. Hebrew templates חייבים לעבור **אישור נפרד של Meta**, כולל validation של RTL rendering. לא מצאתי `template` call ב-`sendWhatsApp` (שורה 36-69) — רק `type: 'text'`.
3. `\n` line breaks ב-WhatsApp עובדים, אבל bullet characters או `═══` (שורה 637, 650) עלולים לא להיראות נכון בכל client.
4. `ש"ח`, `בע"מ`, `מפרט` כולם valid Hebrew — אין issue כאן.

**חומרה:** זה לא בעיית i18n — זו בעיית WhatsApp Business API compliance. אבל ההחלטה **לעשות את התבנית בעברית inline** משפיעה על ה-i18n path.

### I18N-12 — Email subject Hebrew encoding (RFC 2047) — N/A [OK]
**ממצא:** אין שליחת מייל מהשרת. בדקתי `server.js` ב-Grep על `mail`, `email`, `nodemailer`, `SMTP` — יש רק שימוש ב-`email` כ-property של supplier ולא כ-delivery channel. `preferred_channel` הוא `whatsapp` או `sms`, לא `email`. **אין בעיה להתלונן עליה.** אם יתווסף מייל בעתיד — יידרש `=?UTF-8?B?...?=` encoding לנושאים עבריים.

### I18N-13 — Right-aligned tables — לא קיימות טבלאות [PARTIAL]
**ממצא:** אין `<table>` בכל ה-JSX. ה-UI בנוי ב-Flexbox/CSS Grid:
- `grid2`, `grid3`, `grid4`, `grid4Small`, `grid5` (שורות 665-668)
- `listItem`: `display: "flex", justifyContent: "space-between"` (שורה 677)

**הבעיה:** ב-RTL, `flex-direction: row` מתהפך אוטומטית ל-RTL (הפריט הראשון ימינה). אבל:
1. `grid5` בשורה 668: `gridTemplateColumns: "1fr 1.5fr 0.7fr 0.7fr 40px"` — הפריט של `40px` (כפתור ביטול) יופיע **בצד שמאל** ב-RTL כי זה העמודה האחרונה. **וודא שזו ההתנהגות הרצויה** (כפתור מחיקה של שורת פריט ב-RFQ — במקומו הנכון).
2. KPI cards ב-`grid4` עם `auto-fit`: סדר הופעה זהה ב-LTR/RTL כי auto-fit מתחיל מהצד ה-"start" אוטומטית.

**לא חסר כלום ב-tables** — אבל חסר במקום זה: לא היה שימוש בסמנטיקה `<table>` / `<thead>` / `<tbody>` למרות שהנתונים מובנים. זו בעיית a11y + i18n גם יחד (screen reader בעברית לא יכריז "שורה 3 עמודה 2").

### I18N-14 — עלות תמיכה באנגלית בעתיד [HIGH]
**הערכת עלות:**
| Component | שינוי נדרש | עלות |
|---|---|---|
| `<html>` shell | הוספת `dir` דינמי | נמוכה |
| 710 שורות JSX hard-coded Hebrew | החלפת כל מחרוזת ב-`t('key')` | **גבוהה מאוד** (~500+ מחרוזות) |
| DB category keys בעברית | Migration של `supplier_products.category` מעברית ל-enum | **גבוהה** (data migration + code) |
| `styles` עם `textAlign: "left"` | החלפה ל-logical (`end`) | נמוכה |
| `toLocaleDateString("he-IL")` hard-coded | פרמטריזציה של locale | בינונית |
| WhatsApp template | יצירת templates נוספים באנגלית ב-Meta | בינונית |
| Status labels (I18N-08) | mapping → labels → i18n | בינונית |
| Error messages ב-server.js (~20+) | חילוץ ל-messages file | בינונית |
| Bidi handling | הוספת `<bdi>` ב-כל מיקום של שם ספק | **בינונית-גבוהה** |

**סה"כ:** הוספת אנגלית **דורשת סיבוב שני של כתיבה מקפת** — בין 5-10 ימי עבודה של מפתח.

### I18N-15 — Israeli phone format [MEDIUM]
**מיקום:** `onyx-dashboard.jsx` שורות 185, 188, 209, 221, 500. `server.js` שורה 40 (`sendWhatsApp`).

```js
// server.js שורה 40:
to: to.replace(/[^0-9+]/g, ''),
```
**ממצא:** ה-server **מנקה** את ה-`to` מכל דבר שאינו ספרה או `+`, אבל **לא מבצע המרה** של פורמט ישראלי:
- ה-user יכול להזין `054-1234567` → ינוקה ל-`0541234567` → נשלח ל-WhatsApp → **ייכשל** כי WhatsApp דורש `+972541234567`.
- אין `if (to.startsWith('0')) to = '+972' + to.substring(1);`
- אין validation ב-UI (שורה 209: `<Input label="טלפון" ...>` — ללא pattern, ללא formatter).

**לגבי display:** שורות 221, 500: `{s.phone}` — מציג את מה שנשמר ב-DB raw. אם ב-DB יש `+972541234567` → המשתמש העברי רואה `+972541234567` (LTR string בתוך RTL layout — יכול לקרות bidi flip). אם יש `054-1234567` → OK.

**המלצה:**
1. Normalize ב-server בכניסה: `normalizeIsraeliPhone(phone) → "+972541234567"`
2. Display formatter: `formatIsraeliPhoneForDisplay(phone) → "054-123-4567"`
3. עטוף את ה-display ב-`<bdi dir="ltr">{formatted}</bdi>` כדי למנוע bidi flip.

---

## 3. טבלת סיכום חומרה

| # | מזהה | נושא | חומרה | השפעה ל-UX היום | השפעה ל-i18n עתידי |
|---|---|---|---|---|---|
| 1 | I18N-01 | אין `<html dir="rtl" lang="he">` | HIGH | toast/dropdown shifts, TTS שבור | blocker |
| 2 | I18N-02 | Physical CSS (`textAlign:"left"`) | HIGH | OK היום | blocker |
| 3 | I18N-03 | `direction:"rtl"` inline מיותר | LOW | OK | cleanup |
| 4 | I18N-04 | Western numerals | OK | ✅ | ✅ |
| 5 | I18N-05 | `₪` placement + bidi | MEDIUM | flicker אפשרי | nuisance |
| 6 | I18N-06 | `he-IL` date format | LOW | ✅ (בקונטקסט ישראל) | חייב פרמטריזציה |
| 7 | I18N-07 | Time format hour cycle | LOW | ✅ | minor |
| 8 | I18N-08 | Status badges English raw | HIGH | חוויה זרה ("DRAFT") | blocker |
| 9 | I18N-09 | Bidi bugs ב-supplier names | HIGH | נראה messy | blocker |
| 10 | I18N-10 | Hard-coded Hebrew (100%) | HIGH לעתיד | ✅ היום | **blocker מוחלט** |
| 11 | I18N-11 | WhatsApp templates Hebrew | MEDIUM | WhatsApp compliance issue | להוסיף en templates |
| 12 | I18N-12 | Email encoding | N/A | לא רלוונטי (אין email) | לטפל כשיתווסף |
| 13 | I18N-13 | טבלאות/tables semantics | LOW | חסר `<table>` אבל grid עובד | minor |
| 14 | I18N-14 | עלות תמיכה באנגלית | HIGH | - | 5-10 ימי עבודה |
| 15 | I18N-15 | Phone format Israeli | MEDIUM | WhatsApp deliveries עלולות להיכשל | - |

---

## 4. Top 5 Actionable Fixes (סדר עדיפויות)

### Fix #1 — הוסף HTML shell נכון [30 דקות]
צור `web/index.html`:
```html
<!doctype html>
<html lang="he" dir="rtl">
<head>
  <meta charset="UTF-8">
  <title>ONYX — טכנו כל עוזי</title>
</head>
<body>
  <div id="root"></div>
  <script type="module" src="/onyx-dashboard.jsx"></script>
</body>
</html>
```

### Fix #2 — מיפוי Hebrew לsatatuses [1 שעה]
הוסף `STATUS_LABELS_HE` ב-JSX והחלף את כל ההצגות של raw status (שורות 158, 466).

### Fix #3 — Phone normalization ב-server [1 שעה]
הוסף `normalizeIsraeliPhone()` ב-`server.js` והחל על כל insertion של supplier. כבר ב-`sendWhatsApp` עשה המרה `0` → `+972`.

### Fix #4 — עטוף supplier names ב-`<bdi>` [2 שעות]
חפש כל מופע של `{supplier.name}`, `{winner.supplier_name}`, `{q.supplier_name}` ועטוף ב-`<bdi>`. באמצעות כך ה-bidi algorithm מבודד את השם ולא מחליף את הסדר במשפט.

### Fix #5 — החלף `textAlign: "left"` ל-`"end"` [15 דקות]
שינוי פשוט של שתי שורות (157, 465) — ומוודא שגם אם יהיה LTR בעתיד, הפיסול לא יהיה הפוך.

---

## 5. המלצות ארוכות טווח

1. **צור `web/i18n/messages.he.json`** — התחל לחלץ מחרוזות בהדרגה (hybrid approach).
2. **Migration של ה-DB** — categories ו-work_types חייבים להפוך ל-enum אנגלי ב-DB. ה-label העברית תוחזק בלקוח בלבד.
3. **הוסף `Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS' })`** — מחליף את ה-`₪{n.toLocaleString()}` ב-formatter נכון שמטפל ב-bidi אוטומטית.
4. **WhatsApp Approved Templates** — צור תבניות HSM ב-Meta Business Manager לרפ"א וחדר"א עם placeholders `{{1}}`, `{{2}}`, ... ואחסן את ה-template names ב-`.env`.
5. **a11y+i18n ביחד** — הוסף `aria-label` עם תרגומים לאייקונים (📦, 🏭, 🎯) כי screen reader עברי לא יקריא אמוג'ים בצורה משמעותית.

---

## 6. סיכום

המערכת **עברית-עובדת** היום אבל ה-i18n/RTL layer שלה **רגיש, חלקי, ושביר**. בכל מקום שהמפתח שם לב לבעיית bidi — הוא "כיסה" נקודתית עם `direction:"rtl"` inline (שורות 401, 562), במקום לתקן בשורש. ה-`textAlign: "left"` ב-שורות 157 ו-465 הן trap חמורים: הן **נראות נכון היום** אבל מקודדות LTR thinking לתוך RTL code. הוספת אנגלית עתידית = refactor משמעותי של 710 שורות.

**המלצה כוללת:** הגישה הנכונה היא לא "להוסיף i18n בעתיד" אלא **להכין את הקרקע עכשיו** — Fix #1, #2, #4, #5 לוקחים יום עבודה ומחסכנים שבועות של צער בעתיד.

**Agent #35 out. ✅**
