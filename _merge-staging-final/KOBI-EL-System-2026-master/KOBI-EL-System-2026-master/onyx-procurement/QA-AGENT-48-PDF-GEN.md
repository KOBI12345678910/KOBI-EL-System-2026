# QA Agent #48 — PDF Generation Quality

**Project:** onyx-procurement
**Date:** 2026-04-11
**Agent:** #48 — PDF Generation Quality dimension
**Method:** Static analysis only (no runtime)
**Files inspected:**
- `server.js` (934 lines)
- `package.json`
- `web/onyx-dashboard.jsx` (first 200 lines + full grep)
- `supabase/migrations/001-supabase-schema.sql`
- `supabase/migrations/002-seed-data-extended.sql`

---

## תקציר מנהלים

**המצב:** אין שום יכולת יצירת PDF במערכת. אפס. לא שרת, לא קליינט, לא ספרייה, לא endpoint, לא dependency, לא עמודת schema לאחסון. זו **פער פונקציונלי מלא** בדימנסיה הזו.

**חומרה:** קריטית לעסק. ספק שמקבל "הזמנת רכש" בתור טקסט WhatsApp בלי PDF לא יכול:
1. להעלות אותה למערכת החשבונות שלו (SAP/Priority/חשבשבת)
2. לאמת חתימה/חותמת
3. לצרף לחשבונית המוחזרת
4. לשמור ברשומות כמסמך רשמי

רו"ח שמבקש חשבונית לא יכול לקבל מהמערכת **כלום** — אין endpoint להפקת חשבונית, אין שדה `invoice_pdf_url` בסכמה, אין bucket ב-Storage שמוגדר.

---

## 🚨 ממצאים קריטיים

### P-01 · אין ספריית PDF בכלל ב-`package.json`
**חומרה:** 🔴 Blocker
**מיקום:** `package.json`

```json
"dependencies": {
  "express": "^4.21.0",
  "@supabase/supabase-js": "^2.45.0",
  "dotenv": "^16.4.5",
  "cors": "^2.8.5"
}
```

**עובדה:** זה הכל. אין `pdfkit`, `puppeteer`, `playwright`, `jspdf`, `html-pdf-node`, `pdfmake`, `@react-pdf/renderer`, `wkhtmltopdf`, ולא `chrome-aws-lambda`. הקובץ המלא של ה-`package.json` מכיל 4 dependencies בלבד.

**משמעות:** אין קוד שבכלל **יכול** להוציא PDF. כל חשבונית/PO שיוצאים מהמערכת הם טקסט גולמי בלבד.

---

### P-02 · אין endpoint להורדה/יצירת PDF
**חומרה:** 🔴 Blocker
**מיקום:** `server.js:596-680` (כל בלוק Purchase Orders)

חיפוש grep על כל הקוד אחרי `pdf|puppeteer|pdfkit|jspdf|html2pdf|wkhtmltopdf|chrome-aws-lambda` → **אפס תוצאות**. חיפוש על `application/pdf`, `content-disposition`, `attachment` → אפס.

הנקודה היחידה שדומה להוצאת PO החוצה היא `POST /api/purchase-orders/:id/send` בשורה 626. **מה שהיא עושה בפועל:**

```js
// server.js:636-658
const message = [
  `══════════════════`,
  `📄 הזמנת רכש`,
  `══════════════════`,
  ``,
  `לכבוד: ${po.supplier_name}`,
  // ... טקסט ASCII/Unicode בלבד
].join('\n');

if (WA_TOKEN && address) {
  sendResult = await sendWhatsApp(address, message);
}
```

זה **לא** PDF. זה הודעת WhatsApp טקסט עם קווי פסאודו-ASCII. זה לא מסמך רשמי ולא ניתן לארכוב או חתימה דיגיטלית.

---

### P-03 · אין עמודת `pdf_url` / `document_url` / `file_path` בסכמה
**חומרה:** 🔴 גבוה
**מיקום:** `supabase/migrations/001-supabase-schema.sql` (`purchase_orders` table @ שורה 192)

grep על `storage|bucket|file|attachment|document|invoice_pdf` בכל ה-schema → החיפוש היחיד שחזר הוא `source TEXT DEFAULT 'quote' CHECK (source IN ('quote', 'invoice', 'market', 'negotiated'))` בשורה 73 של `supplier_products` — זה רק ENUM לסיווג מקור מחיר, **לא** משהו שקשור לקובץ.

אין עמודות כמו:
- `po_pdf_url TEXT`
- `invoice_pdf_url TEXT`
- `generated_at TIMESTAMPTZ`
- `pdf_hash TEXT` (לאימות integrity)
- `signed BOOLEAN`

**משמעות:** גם אם מחר נכניס יצירת PDF, אין לאן לשמור את ה-URL שלו. זה חסר תכנון data-model מלא.

---

### P-04 · אין Supabase Storage bucket מוגדר
**חומרה:** 🔴 גבוה
**מיקום:** `supabase/migrations/001-supabase-schema.sql` — כל הקובץ

אין קריאות ל-`storage.create_bucket()`, אין `insert into storage.buckets`, אין RLS policy ל-`storage.objects`. ספריית `@supabase/supabase-js` אמנם תומכת ב-Storage API, אבל בשום מקום בקוד לא משתמשים ב-`supabase.storage.from(...)`:

grep על `supabase.storage` בכל השרת → אפס.

**משמעות:** אפילו אם היינו יוצרים PDF ב-Buffer, אין לאן להעלות אותו. אפשרויות:
1. Supabase Storage (הנדרש — זו הסטאק הנוכחי) — **לא מוגדר**
2. ephemeral במערכת הקבצים של Replit — **יימחק ב-deploy הבא**
3. החזרה ישירה ל-client כ-Buffer — **עובד אבל לא ניתן לאחזור אחרי כן**

---

## 🟠 ממצאים פונקציונליים

### P-05 · בעיית Hebrew-RTL ב-pdfkit (אם נבחר)
**חומרה:** 🟠 גבוה
**הקשר:** אם הצוות יחליט על `pdfkit` (הבחירה הטבעית ל-Node.js pure), זה **לא יעבוד out-of-the-box לעברית**.

`pdfkit` לא תומך בצורה טבעית ב-Unicode BiDi (UAX #9). טקסט עברי ייצא הפוך או שבור. פתרונות ידועים:
1. להשתמש ב-`pdfkit` + `harfbuzz-wasm` + לעשות shaping ידני — **לא טריוויאלי**
2. להשתמש ב-`pdfmake` — יש תמיכה חלקית אבל עדיין דורש font embedding ידני והגדרת `alignment: 'right'` + `direction: 'rtl'`
3. להשתמש ב-`puppeteer` + HTML + CSS `dir="rtl"` + `font-family: 'Rubik'` — **הפתרון הבטוח ביותר לעברית**

**המלצה:** לא `pdfkit`. ראה סעיף המלצות.

---

### P-06 · Embedding של גופן עברי — רישוי
**חומרה:** 🟠 בינוני
**הקשר:** כל ספריית PDF חייבת embed של הגופן. הדשבורד (`onyx-dashboard.jsx:101`) כבר משתמש ב-`Rubik`:

```jsx
@import url('https://fonts.googleapis.com/css2?family=Rubik:wght@400;500;600;700;800;900&display=swap');
```

**רישוי Rubik:** Open Font License (SIL OFL 1.1) — ✅ **מותר** ל-embed ב-PDF, ✅ שימוש מסחרי, ✅ חלוקה מחדש.

**אם ישקלו חלופות:**
- **Frank Ruhl Libre** — SIL OFL, ✅ בסדר
- **David** (מערכת ההפעלה מיקרוסופט) — ❌ **אסור** embed, רישוי Microsoft מוגבל
- **Narkisim / Guttman** — ❌ רישוי פרטי, לא embed חופשי
- **Open Sans Hebrew** — Apache 2.0, ✅ בסדר
- **Assistant** — SIL OFL, ✅ בסדר

**המלצה:** Rubik (כבר בשימוש ב-UI) + Assistant כחלופה. **לא** להשתמש ב-David.

**פעולה:** להוריד את הקובץ `Rubik-Regular.ttf` + `Rubik-Bold.ttf` לתיקייה `assets/fonts/` ולצרף ללוגיקת PDF generation.

---

### P-07 · Logo עבור ראש ה-PO
**חומרה:** 🟡 בינוני
**הקשר:** הדשבורד משתמש בלוגו-טקסטואלי בלבד:

```jsx
<div style={styles.logo}>O</div>
```

זה div עם האות "O" בלבד. **אין קובץ לוגו אמיתי במערכת** (`logo.png`, `logo.svg`, וכו'). PO רשמי של "טכנו כל עוזי בע"מ" אמור לכלול לוגו חברה.

**חסר:**
1. קובץ לוגו (PNG/SVG)
2. עמודת `company_logo_url` בטבלה של הגדרות
3. טבלת `company_settings` באופן כללי (כתובת, ח.פ., טלפון, אימייל, חתימה) — **לא קיימת**

grep על `company_settings|company_info|organization|tenant` ב-schema → אפס.

**משמעות:** גם אם נכניס PDF generation, כל הפרטים הרשמיים של החברה (ח.פ., כתובת מלאה, מספר עוסק מורשה, חשבון בנק) יוקשחו (hardcoded) בקוד או יחסרו.

---

### P-08 · Page-break ב-PO עם הרבה פריטים
**חומרה:** 🟡 בינוני (צפוי בעתיד)
**הקשר:** PO רגיל במערכת רכש בבניין יכול להכיל 30-100 פריטי רכש (ברזים, ברגים, מסגרות, אביזרים). כל ספריית PDF מטפלת בזה שונה:

- `pdfkit`: דורש לוגיקה ידנית של `doc.y > pageHeight - margin → doc.addPage()`
- `puppeteer`: נכנס אוטומטית עם CSS `page-break-inside: avoid` על `<tr>`
- `pdfmake`: עם `pageBreakBefore` function per-item

**הסיכון בלי ניהול:** שורה אחרונה נחתכת באמצע, סכום "סה"כ" נופל לעמוד 2 בלי כותרת העמודה, חותמת/חתימה ברגל העמוד מופיעה רק בעמוד האחרון.

**אין עדיין גם 1 פריט PO שעבר PDF,** אז אי אפשר לבדוק את זה בפועל. ממצא תאורטי.

---

### P-09 · חישוב מע"מ — דיוק
**חומרה:** 🟡 בינוני
**מיקום:** `server.js:377`

```js
const vatAmount = quoteData.vat_included ? 0 : Math.round(totalPrice * 0.18);
```

**בעיות:**
1. **הנחת 18%** — אחוז המע"מ בישראל **נכון לאפריל 2026 הוא 18%** (עלה מ-17% ב-2025), **אבל** זה hardcoded. אם שר האוצר יעלה ל-19% ב-2027 — כל PO יהיה שגוי. צריך `vat_rate` ב-`company_settings` או בפרמטר סביבה.
2. **`Math.round`** — עיגול לשקל שלם. אפשר לאבד אגורות ב-invoice ארוך (מדרש מס הכנסה מקבל עיגול, אבל רצוי `Math.round(x * 100) / 100` לשתי ספרות).
3. **רכיב `vat_included` הפוך** — הקוד מחשב 0 כשהמע"מ **כלול**. זה נכון מתמטית אבל כש-PDF יציג את זה, צריך להציג "מחיר כולל מע"מ" או "מחיר ללא מע"מ" לפי הדגל. אין פורמט ברור לזה ב-`server.js:649`:

```js
`מע"מ: ₪${po.vat_amount.toLocaleString()}`
```

אם `vat_included=true`, ה-message יציג "מע"מ: ₪0" — **מטעה** למקבל שיחשוב שהמחיר לא כולל מע"מ.

**המלצה:** להוסיף טקסט מפורש "המחיר כולל מע"מ" / "לא כולל מע"מ" בפלט PDF/WhatsApp.

---

### P-10 · מספור עמודים
**חומרה:** 🟢 נמוך (לעתיד)
**הקשר:** PO רשמי בעברית בדרך כלל משתמש במספור מערבי (`עמוד 1 מתוך 3`), **לא** בספרות עבריות (א'/ב'/ג'). זה מוסכם בפועל. עם זאת, אין אף ספריית PDF שיש לה "page numbering in Hebrew" built-in, אז כל יישום יצטרך פורמט ידני:

```
עמוד {current} מתוך {total}
```

**אין כרגע.** כשיישמו PDF, לוודא:
- מיקום: rtl — הפינה **השמאלית** העליונה/תחתונה (כי זה "התחלת השורה" ב-rtl)
- פונט: Rubik, גודל 9pt
- צבע: אפור משני

---

### P-11 · PDF/A לארכוב משפטי
**חומרה:** 🟡 בינוני (compliance)
**הקשר:** חוק חתימה דיגיטלית 2001 בישראל + הנחיות רשות המסים לשמירה חשבוניות אלקטרוניות, מחייבים:
1. שמירת חשבונית שהוצאה — **שבע שנים**
2. פורמט שלא ניתן לשינוי ניטרלי פלטפורמה — **PDF/A-1b** או **PDF/A-3**

**עובדה:** מתוך הספריות הרלוונטיות, רק `puppeteer-pdf-a` (wrapper) או שימוש ב-Ghostscript post-processing יכולים להפיק PDF/A. `pdfkit` ו-`pdfmake` מייצרים PDF 1.7 רגיל שחסר:
- XMP metadata
- ICC color profile
- Font embedding subset guarantee

**משמעות:** הפתרון הפשוט הוא להעלות את ה-PDF הרגיל ל-Supabase Storage + לשמור checksum SHA-256 ב-DB כ-"תעודת-integrity". זה **לא פורמלי PDF/A** אבל עומד ב-evidence-based compliance.

---

### P-12 · חתימה דיגיטלית (חתימה דיגיטלית חוק 2001)
**חומרה:** 🟡 בינוני (compliance)
**הקשר:** חוק חתימה אלקטרונית (תיקון 2018) — חשבוניות אלקטרוניות חייבות להיחתם בחתימה "מתקדמת" או "מאושרת":
- **חתימה מתקדמת:** PKCS#7/PAdES — אפשר דרך `node-signpdf` או OpenSSL post-processing
- **חתימה מאושרת:** דורשת certificate מ-CA ישראלי (Comsign, Personal-ID)

**אין תשתית במערכת.** grep על `sign|certificate|pkcs|pades|pki` בקוד → אפס.

**משמעות עסקית:** הזמנת רכש **לא** חייבת חתימה דיגיטלית מבחינה חוקית (היא מסמך פנימי). **חשבונית** — כן חייבת (אם נפיק אותה מהמערכת למען לקוחות). כרגע אין יצירת חשבונית בכלל, אז החיסרון הזה הוא עתידי.

---

### P-13 · Concurrent PDF generation — memory pressure
**חומרה:** 🟠 גבוה (אם יכולים מחר)
**הקשר:** כשתוקס PDF תיכנס, כל הפתרונות שונים בתשלום זיכרון:

| Library | Memory per PDF | Notes |
|---|---|---|
| `pdfkit` pure | ~5-20 MB | Pure JS, קל |
| `pdfmake` | ~10-30 MB | Pure JS |
| `puppeteer` (headless Chrome) | **~200-400 MB** | Chromium נטען לכל generation! |
| `puppeteer-core` + `chrome-aws-lambda` | ~150 MB | Slim |
| `playwright` | ~180 MB | דומה ל-puppeteer |

**סביבת הרצה:** Replit (מניחים מהשם הקובץ `SETUP-GUIDE-STEP-BY-STEP.md`) מגביל RAM ל-512 MB ב-plan החינמי.

**משמעות:** שני PO מקבילים עם puppeteer = crash מיידי. פתרונות:
1. Queue (`bull`/`bullmq`) + worker concurrency=1
2. לעבור ל-`pdfkit`/`pdfmake` — אבל אז בעיית RTL חוזרת
3. להשתמש ב-API חיצוני (DocRaptor/APIbraptor) — עלות + dependency

---

### P-14 · Email attachment של PDF (cross-ref Agent 44)
**חומרה:** 🟠 גבוה
**הקשר:** במערכת הנוכחית אין שום אינטגרציית email. grep על `nodemailer|sendgrid|mailgun|ses|smtp|mail.send` → אפס.

גם אם נייצר PDF — אין מנגנון לשלוח אותו לרו"ח באימייל. זו תלות-צולבת עם סוכן 44 (Email delivery).

**המלצה:** sendgrid/resend + `attachment: [{ content: base64Pdf, filename: 'PO-12345.pdf', type: 'application/pdf' }]`.

---

### P-15 · WhatsApp document type (cross-ref Agent 45)
**חומרה:** 🟠 גבוה
**מיקום:** `server.js:36-69` (`sendWhatsApp`)

הפונקציה הנוכחית שולחת רק `type: 'text'`:

```js
const data = JSON.stringify({
  messaging_product: 'whatsapp',
  recipient_type: 'individual',
  to: to.replace(/[^0-9+]/g, ''),
  type: 'text',  // ← רק טקסט
  text: { preview_url: false, body: message },
});
```

WhatsApp Business API תומך ב-`type: 'document'`:

```json
{
  "type": "document",
  "document": {
    "link": "https://storage.supabase.../PO-12345.pdf",
    "caption": "הזמנת רכש #12345",
    "filename": "PO-12345.pdf"
  }
}
```

**מה שחסר:**
1. קובץ PDF נגיש ב-URL ציבורי (צריך Supabase Storage + public bucket או signed URL)
2. לשנות את `sendWhatsApp` לקבל פרמטר `type` + לתמוך ב-document
3. לוודא שה-PDF קטן מ-100 MB (WhatsApp limit)
4. ה-URL חייב להיות HTTPS ולתמוך ב-HEAD request

---

### P-16 · Mobile preview rendering
**חומרה:** 🟡 בינוני
**הקשר:** כשהספק יקבל PDF ב-WhatsApp ויפתח אותו בטלפון:
- **iOS** — Preview native, תומך RTL ו-embedded fonts טוב
- **Android** — Google PDF Viewer, יש בעיות ידועות עם Hebrew bidi בגופנים embedded
- **WhatsApp in-app viewer** — רנדרר פנימי מוגבל, יכול לחתוך שוליים או להציג טקסט עברי שבור

**פתרון:**
1. להשתמש ב-**Type1 fonts או TrueType** (לא OpenType) — תמיכה רחבה יותר
2. Embed את כל הגליף (לא subset) — גודל קובץ גדול יותר אבל תאימות מלאה
3. לבדוק ידנית על Android + iOS + WhatsApp viewer לפני שחרור

---

## 🟢 המלצת Stack — Hebrew-RTL-friendly

לפי ניתוח זה, ההמלצה היא:

### 🥇 אופציה 1 (מומלצת): **Puppeteer + HTML/CSS RTL**
```json
{
  "puppeteer": "^23.0.0",
  "handlebars": "^4.7.8"
}
```

**למה:**
- ✅ RTL עובד מושלם עם `<html dir="rtl">` + CSS `direction: rtl`
- ✅ Rubik font דרך `@font-face` — זהה ל-UI
- ✅ Page-break אוטומטי עם `page-break-inside: avoid`
- ✅ Logo/SVG עובדים natively
- ✅ קל לדיבוג (אפשר לפתוח את ה-HTML בדפדפן)
- ❌ זיכרון גבוה (200-400 MB) — צריך queue + concurrency=1
- ❌ Install של Chromium = 300 MB ב-deploy

**Workflow:**
```
Handlebars template (po-template.hbs)
  → HTML + inline CSS + embedded Rubik font
  → puppeteer.launch() → page.setContent(html) → page.pdf({ format: 'A4' })
  → Buffer → supabase.storage.from('po-pdfs').upload(path, buffer)
  → public URL → WhatsApp document message
```

---

### 🥈 אופציה 2 (חלופה): **pdfmake עם custom Hebrew fonts**
```json
{
  "pdfmake": "^0.2.10"
}
```

**למה:**
- ✅ זיכרון נמוך (~30 MB)
- ✅ Pure JS — עובד ב-Replit
- ✅ תומך ב-embedded fonts (vfs_fonts)
- ⚠️ RTL דורש הגדרה ידנית: `alignment: 'right'` + `direction: 'rtl'` לכל בלוק
- ⚠️ טבלאות עם rtl: הסדר של העמודות מתהפך — צריך לשלוט ידנית
- ❌ BiDi לא מושלם למחרוזות מעורבות עברית+אנגלית+מספרים

**דורש:** יצירת `vfs_fonts.js` ידני עם Rubik מ-`pdfmake/src/fontDescriptors`.

---

### 🥉 אופציה 3 (לא מומלץ): **pdfkit + bidi-js**
לא מומלץ. תמיכת RTL לא מספיק בוגרת, דורש shaping ידני של כל מחרוזת, וה-debugging סיוט.

---

## ✅ Action Items (עדיפות)

### P0 (חובה לפני שחרור):
1. **לבחור ספריית PDF** — המלצתי: puppeteer (אופציה 1)
2. **להוסיף ל-`package.json`**: `puppeteer`, `handlebars`
3. **ליצור Supabase Storage bucket**: `po-pdfs` עם RLS מתאים
4. **ליצור טבלה `company_settings`**: (כתובת, ח.פ., לוגו_URL, חתימה_URL, מע"מ_rate)
5. **ליצור template**: `templates/po-template.hbs` עם `dir="rtl"`, Rubik font, לוגו
6. **להוסיף עמודות לטבלה `purchase_orders`**: `pdf_url TEXT`, `pdf_hash TEXT`, `pdf_generated_at TIMESTAMPTZ`
7. **endpoint חדש**: `GET /api/purchase-orders/:id/pdf` → מייצר + מעלה + מחזיר URL
8. **לשדרג `POST /api/purchase-orders/:id/send`**: להשתמש ב-PDF URL ולשלוח כ-`type: 'document'`

### P1 (תוך חודש מהשחרור):
9. **invoice generation**: endpoint נפרד ליצירת חשבונית (עם מספור רצף רשמי)
10. **email delivery**: `nodemailer`/`resend` עם attachment
11. **queue**: `bullmq` + Redis ל-PDF generation concurrency control
12. **PDF retention**: 7 שנים (hard-delete אסור, רק soft-delete)

### P2 (לעתיד):
13. **חתימה דיגיטלית**: `node-signpdf` + certificate מ-Comsign
14. **PDF/A compliance**: post-process עם Ghostscript או להעביר ל-API חיצוני
15. **A/B testing**: 2 עיצובים + מדידה איך ספקים מגיבים (CTR)

---

## תקציר עברי לדוח wave
```
Agent 48 - PDF Generation: CRITICAL GAP
- אפס ספריית PDF במערכת
- אפס endpoint יצירת PDF
- אפס עמודות schema לאחסון
- אפס Supabase Storage bucket
- WhatsApp רק טקסט, לא document
- מע"מ מקודד קשיח 18% (נכון ל-2026 אבל לא גמיש)
- אין company_settings בכלל
- המלצה: Puppeteer + Handlebars + Rubik font
```

**סטטוס:** 🔴 Block — לא ניתן לשחרר production בלי PDF
