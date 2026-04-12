# QA-AGENT-28 — PII Inventory & Data Flow Mapping

**Project:** onyx-procurement
**Scope:** 001-supabase-schema.sql, 002-seed-data-extended.sql, server.js, onyx-dashboard.jsx
**Agent:** QA #28
**Date:** 2026-04-11
**Analysis type:** Static only. Hebrew.

---

## 1. טבלת מלאי PII מלאה

| Table | Column | PII Type | Subject | Source | Retention | Purpose |
|---|---|---|---|---|---|---|
| suppliers | name | Company name (business PII) | Supplier (legal person / sole proprietor) | מוזן ע"י Kobi / API POST `/api/suppliers` | לא מוגדר (forever) | זיהוי ספק, הצגה ב-UI, הודעות |
| suppliers | contact_person | שם מלא של אדם פרטי (person name) | Supplier contact | מוזן ידנית | לא מוגדר | פנייה אישית |
| suppliers | phone | טלפון (MSISDN) | Supplier contact | ידני (NOT NULL) | לא מוגדר | שליחת WhatsApp/SMS |
| suppliers | email | כתובת אימייל | Supplier contact | ידני, nullable | לא מוגדר | שליחת RFQ במייל |
| suppliers | whatsapp | מספר WhatsApp | Supplier contact | ידני | לא מוגדר | ערוץ `preferred_channel='whatsapp'` |
| suppliers | address | כתובת פיזית | Supplier | ידני, nullable | לא מוגדר | כתובת הספק (UI, דוחות) |
| suppliers | country | מדינה | Supplier | ידני, default 'ישראל' | לא מוגדר | סגמנטציה |
| suppliers | notes | free-text (עלול להכיל PII!) | Supplier | ידני | לא מוגדר | הערות חופשיות על הספק |
| suppliers | tags | מערך תגיות (עלול להכיל quasi-PII) | Supplier | ידני | לא מוגדר | סיווג/סינון |
| subcontractors | name | שם אדם/עסק | Subcontractor | ידני | לא מוגדר | זיהוי |
| subcontractors | phone | טלפון | Subcontractor | ידני (NOT NULL) | לא מוגדר | שליחת work-order |
| subcontractors | email | אימייל | Subcontractor | ידני, nullable | לא מוגדר | שליחה במייל |
| subcontractors | specialties | מערך תחומים | Subcontractor | ידני | לא מוגדר | התאמה לעבודה |
| subcontractors | notes | free-text | Subcontractor | ידני | לא מוגדר | הערות |
| purchase_requests | requested_by | שם/מזהה מבקש (TEXT) | Employee (internal) | ידני (NOT NULL) | לא מוגדר | אחריות על הבקשה |
| purchase_orders | requested_by | שם/מזהה | Employee | ידני | לא מוגדר | אודיט |
| purchase_orders | approved_by | שם/מזהה מאשר | Employee | ידני | לא מוגדר | אודיט |
| purchase_orders | delivery_address | כתובת משלוח (default 'ריבל 37, תל אביב' — כתובת המשרד של Kobi) | Company (Kobi) | hardcoded default | לא מוגדר | לוגיסטיקה |
| purchase_orders | supplier_name | denormalized | Supplier | copied on decision | לא מוגדר | דוחות |
| rfq_recipients | supplier_name | denormalized | Supplier | copied on RFQ send | לא מוגדר | לוג שליחה |
| supplier_quotes | supplier_name | denormalized | Supplier | copied | לא מוגדר | הצגה |
| procurement_decisions | selected_supplier_name | denormalized | Supplier | copied | לא מוגדר | היסטוריית החלטות |
| procurement_decisions | reasoning | JSONB (מכיל שמות ספקים!) | Supplier | מיוצר ע"י AI decision | לא מוגדר | הסבר להחלטה |
| subcontractor_decisions | client_name | **שם לקוח קצה של Kobi** | Client (external, non-Kobi customer) | ידני | לא מוגדר | שיוך העבודה ללקוח |
| subcontractor_decisions | project_name | שם פרויקט (עלול להכיל שם לקוח) | Client | ידני | לא מוגדר | שיוך |
| subcontractor_decisions | selected_subcontractor_name | denormalized | Subcontractor | copied | לא מוגדר | היסטוריה |
| subcontractor_decisions | reasoning | JSONB | Subcontractor + Client | generated | לא מוגדר | הסבר |
| audit_log | actor | שם משתמש שביצע פעולה (TEXT) | Employee / API | `req.body.*_by \|\| 'api'` | לא מוגדר | שרשרת אחריות |
| audit_log | detail | free-text (מכיל שמות ספקים!) | Supplier / Employee | server.js:152,412,582,672 | לא מוגדר | תיאור הפעולה |
| audit_log | previous_value | **JSONB עם ערכי PII קודמים** | Supplier | `audit('supplier',...,prev,data)` | לא מוגדר (forever) | לוג שינויים |
| audit_log | new_value | **JSONB עם ערכי PII חדשים** | Supplier | same | לא מוגדר | לוג שינויים |
| system_events | message | free-text (מכיל מספרי טלפון מ-webhook!) | Supplier / WhatsApp sender | `server.js:892` — `הודעה מ-${from}: ${text}` | לא מוגדר | לוג מערכת |
| system_events | data | JSONB (מכיל `from`, `text`, `messageId`, `timestamp`) | WhatsApp sender | `server.js:893` | לא מוגדר | דיבוג webhook |
| notifications | recipient | TEXT — יכול להיות טלפון/אימייל | Employee / Supplier | NOT NULL | לא מוגדר | שליחת התראה |
| notifications | message | free-text | varies | ידני | לא מוגדר | תוכן ההתראה |
| price_history | — | אין PII ישיר, אך `supplier_id` מקשר | Supplier | FK | לא מוגדר | היסטוריית מחירים |
| supplier_products | — | אין PII ישיר, `supplier_id` מקשר | Supplier | FK | לא מוגדר | קטלוג |

---

## 2. Source / Retention / Purpose — סיכום

### 2.1 מקורות הזנה
| סוג מקור | שדות |
|---|---|
| **ידני (Kobi via UI)** | suppliers.*, subcontractors.*, purchase_requests.requested_by, purchase_request_items.*, purchase_orders.approved_by |
| **API POST חיצוני** | `/api/suppliers` POST, `/api/subcontractors` POST, `/api/quotes` (supplier_name מועתק מה-body) |
| **מתקבל מ-WhatsApp Webhook** | system_events.data.from (phone), system_events.data.text (body), system_events.data.messageId |
| **Denormalized / copied** | rfq_recipients.supplier_name, supplier_quotes.supplier_name, purchase_orders.supplier_name, procurement_decisions.selected_supplier_name (copied at write time, NO back-sync if supplier renamed) |
| **Hardcoded** | purchase_orders.delivery_address DEFAULT `'ריבל 37, תל אביב'` — **כתובת משרד Kobi hardcoded ב-schema** (001-supabase-schema.sql:204) |
| **AI-generated** | procurement_decisions.reasoning (JSONB, includes supplier names in free text) |

### 2.2 Retention Policy
**אין retention policy מוגדר** — אין TTL, אין עמודת `deleted_at`, אין Cron למחיקה, אין Supabase policy. כל ה-PII נשמר **לעולמי עולמים** אלא אם יבוצע DELETE ידני.

### 2.3 Purpose
**לכל ה-PII:** זיהוי ספק/קבלן לצורך שליחת RFQ/PO/work-order דרך WhatsApp/SMS/Email, אודיט, ודוחות אנליטיים.

---

## 3. Audit Log — שומר ערכי PII ישנים?

**כן — בעיית פרטיות חמורה.** `server.js:99-105`:
```js
async function audit(entityType, entityId, action, actor, detail, prev, next) {
  await supabase.from('audit_log').insert({
    entity_type, entity_id, action, actor, detail,
    previous_value: prev, new_value: next,
  });
}
```
ו-`server.js:157-163` קורא:
```js
const { data: prev } = await supabase.from('suppliers').select('*').eq('id', ...);
// ...
await audit('supplier', data.id, 'updated', ..., JSON.stringify(req.body), prev, data);
```

**משמעות:**
- כל עדכון ספק מעתיק את **כל השורה הישנה** (כולל phone, email, address, whatsapp, contact_person, notes) לתוך `audit_log.previous_value`.
- אם ספק מבקש "שנה את הטלפון שלי" — המספר הישן נשאר לעד ב-audit_log.
- אם ספק מבקש "מחק אותי" (Right to Erasure / זכות להישכח, חוק הגנת פרטיות 1981 §13ב) — DELETE על `suppliers` לא מוחק שום דבר מ-`audit_log` (אין FK, אין CASCADE).
- `audit_log.detail` שדה חופשי שמכיל שמות ספקים בפורמט hardcoded: `server.js:152` → `'ספק חדש: ${data.name}'`, `server.js:582` → `'בחר ${winner.supplier_name} — ₪...'`. גם מחיקה של ספק לא תמחק את השמות שלו מ-audit_log.detail.

**חומרה:** HIGH — privacy breach potential, בעיה רגולטורית.

---

## 4. WhatsApp Webhook — אילו נתוני מנוי זורמים פנימה?

**endpoint:** `POST /webhook/whatsapp` (server.js:876-901)

**מה נכנס מ-Meta:**
- `entry[0].changes[0].value.messages[].from` — **מספר טלפון בינלאומי של השולח** (כל אחד שמכניס הודעה!)
- `msg.text.body` — **תוכן ההודעה** (עד 200 תווים נשמרים ב-log)
- `msg.id` — Meta message ID
- `msg.timestamp` — Unix timestamp
- `msg.type` — טקסט/מדיה/וכו'

**איפה נשמר:**
```js
await supabase.from('system_events').insert({
  type: 'whatsapp_incoming',
  message: `הודעה מ-${from}: ${text.slice(0, 200)}`,  // <<< PII בטקסט חופשי
  data: { from, text, messageId: msg.id, timestamp: msg.timestamp },  // <<< PII ב-JSONB
});
```

**בעיות:**
1. **אין סינון** — גם אם רנדומלי זר ישלח הודעה לטלפון העסקי, המספר שלו + תוכן ההודעה ילך ל-DB.
2. **אין בדיקה** שה-`from` קיים ב-`suppliers` — כולם נשמרים.
3. **אין ryerashah** — איך לוגים של WhatsApp משתמרים? אין TTL.
4. **text נשמר פעמיים** — פעם ב-`message` ופעם ב-`data.text` (כפילות).
5. **אין `console.log` rotation** — `server.js:896` מדפיס את המספר ל-stdout שזורם ל-PM2/Docker logs.

---

## 5. Normalization של טלפונים

**אין standard.** בדיקה מקיפה:

| מקום | פורמט | קוד |
|---|---|---|
| seed data 001 | `+972501111111` (5 ספקים) | 001-supabase-schema.sql:500-504 |
| seed data 002 | `+972521001001` עד `+972521012012` (12 ספקים IL) | 002-seed-data-extended.sql:23-41 |
| seed data 002 | `+8613800138000` (Foshan, CN) | 002-seed-data-extended.sql:42 |
| seed data subs | `+972541001001` עד `+972541008008` | 002-seed-data-extended.sql:246-253 |
| sendWhatsApp | `to.replace(/[^0-9+]/g, '')` | server.js:40 |

**ממצאים:**
- ה-seed data עצמו כולן ב-E.164 עם `+972`, כולל 1 מספר סיני `+8613...`.
- ב-`sendWhatsApp` יש נרמול מינימלי: מסיר הכל חוץ מ-ספרות ו-`+`. זה **לא** E.164 אמיתי — `0501234567` יהפוך ל-`0501234567` (לא יוסיף `+972`, לא יסיר אפס מוביל).
- **אין CHECK constraint** על `suppliers.phone` — אפשר להזין "abc" או "050-1234567" (dash) ולא יתקבל שום warning. WhatsApp יכשל שקט.
- **אין TRIGGER** שמנרמל בהכנסה.
- **אין פונקציית `normalizePhone()`** בקוד.
- ב-UI (onyx-dashboard.jsx:209) ה-Input חופשי, ללא validation: `<Input label="טלפון" ... />`.

**סיכון:** משתמש יזין `052-1234567`, sendWhatsApp ישלח ל-`0521234567` → Meta API יחזיר error → הספק לא מקבל את ה-RFQ, ו-`rfq_recipients.delivered=false` ייכנס. נרשם ב-DB בלי התראה.

---

## 6. Soft-delete vs Hard-delete — מחיקת ספק מוחקת PII?

**בדיקה מלאה:**

### 6.1 האם יש endpoint מחיקה?
`grep DELETE /api/suppliers` בתוך server.js → **אין**. אין `app.delete('/api/suppliers/:id', ...)` כלל. אין route למחיקה.

### 6.2 האם יש soft-delete?
`suppliers.active BOOLEAN DEFAULT true` (001:35). **זהו המנגנון היחיד** — "מחיקה" = set active=false.
- אין עמודת `deleted_at`, אין `deleted_by`, אין `deletion_reason`.
- ה-UI אינו חושף כפתור "השבת" (מקריאת onyx-dashboard.jsx).
- כל ה-PII (phone, email, address, contact_person, notes) נשאר **מלא ונגיש** כשactive=false.

### 6.3 אם יעשו `DELETE FROM suppliers` ידנית ב-SQL:
- **CASCADE יעבור אל**: supplier_products (001:46), price_history (001:67).
- **לא יעבור אל (נשאר יתום או שובר FK)**:
  - `rfq_recipients.supplier_id` — **REFERENCES suppliers(id)** ללא CASCADE → DELETE ייכשל אם יש recipients קיימים.
  - `supplier_quotes.supplier_id` — אותו דבר.
  - `purchase_orders.supplier_id` — אותו דבר.
  - `procurement_decisions.selected_supplier_id` — אותו דבר.
- **לא נמחק כלל**:
  - `rfq_recipients.supplier_name` (TEXT denormalized) — נשאר לנצח.
  - `supplier_quotes.supplier_name` — נשאר.
  - `purchase_orders.supplier_name` — נשאר.
  - `procurement_decisions.selected_supplier_name` + `reasoning` JSONB — שם הספק נשאר ב-free text.
  - `audit_log.previous_value` + `detail` — כל ה-phone/email/address שהיו אי פעם ב-DB נשמרים.
  - `system_events.data.from` — כל מספרי WhatsApp שזרמו ב-webhook.
  - `notifications.recipient` — אם נשלחה התראה לטלפון של הספק.

**מסקנה:** מחיקה אמיתית של ספק + כל ה-PII שלו **בלתי אפשרית** ללא מחיקה ידנית רב-טבלאית. **זכות להישכח לא ניתנת למימוש** עם ה-schema הנוכחי.

---

## 7. Grep קשוח לאימיילים/טלפונים בקוד (דליפה פוטנציאלית)

### server.js
- **אימיילים:** `none`. הקוד נקי מאימיילים hardcoded.
- **Hostnames:** `graph.facebook.com` (server.js:47), `api.twilio.com` (server.js:80) — מבחינת secrets, token ב-`process.env` — נקי.
- **טלפונים:** אין hardcoded phones ב-server.js. כל המספרים דינמיים.
- **כתובות:** `'ריבל 37, תל אביב'` — **hardcoded default** ב-001-supabase-schema.sql:204. כתובת המשרד של Kobi ב-schema; לא secret אבל מוטמע.

### onyx-dashboard.jsx
- אין hardcoded PII.
- יש Google Fonts URL (fonts.googleapis.com) — לא PII.

### 002-seed-data-extended.sql — 🚨 כאן יש הרבה!
ראה סעיף 8.

---

## 8. נתוני דוגמה — האם seeded suppliers משתמשים במספרי טלפון אמיתיים?

**ככל הנראה לא — אך לא ניתן לאמת סטטית.** ניתוח:

| קובץ | טלפונים | אימיילים | הערכה |
|---|---|---|---|
| 001-supabase-schema.sql | `+97250[1-5]xxx` עם x=ספרה חוזרת (1111111, 2222222) | `avi@metalmax.co.il`, `moshe@steelpro.co.il`, `dani@aluisrael.co.il`, `ronen@glass-sharon.co.il` | **כנראה פיקטיבי** — הדפוס `0501111111` לא מוקצה ב-ISR |
| 002-seed-data-extended.sql | `+9725210010xx`, `+9725210020xx`... `+9725410080xx` | `shimon@metalsaron.co.il`, `roi@ironandsteel.co.il`, `inbal@alumitek.co.il`, ועוד 10 אימיילים | **דפוס ברור:** `+972521001001` ... `+972521012012` — לא יכול להיות אמיתי |
| 002 (Foshan) | `+8613800138000` | `david@foshansteel.com` | `138 0013 8000` הוא מספר "demo" ידוע של China Telecom |
| 002 (קבלני משנה) | `+972541001001` ... `+972541008008` | NULL | סינתטי |

**אזהרות:**
1. ה-**דומיינים** (`metalsaron.co.il`, `ironandsteel.co.il`, `alumitek.co.il`, `aluisrael.co.il`, וכו') לא נבדקו אם הם רשומים — **אם מישהו יקנה דומיין כזה יוכל לקלוט מיילים שייוצרו אם השרת ישלח RFQ ל-seed data בסביבת production.** לא רק בסיכון תאורטי: `tambour-dist.co.il` — טמבור אמיתית.
2. `david@foshansteel.com` — **foshansteel.com הוא דומיין רשום (Foshan Steel Co)**. שליחת הודעות ל-david@foshansteel.com מהשרת אם הוא יופעל עם seed data תגיע ליעד אמיתי.
3. אם סביבת staging/dev משתמשת ב-seed האלה ויש `WHATSAPP_TOKEN` פעיל — המערכת עלולה לשלוח הודעה אמיתית ל-`+972521001001` שמקבלת אותה טלפון אמיתי (אם מוקצה).

**חומרה:** MEDIUM-HIGH — seed data צריכה להיות עם דומיינים `@example.com` ומספרי `+9725000000xx` (טווח non-assigned).

---

## 9. Anonymization Pattern — האם קיים?

**לא.** חיפוש מלא:
- `mask`, `redact`, `anonymize`, `pseudonymize`, `hash`, `crypt` — אין אף אחד ב-server.js, בקיימת ב-schema, ולא ב-dashboard.jsx.
- אין VIEWs שמסתירים שדות (supplier_dashboard VIEW חושף phone מלא — 001:460).
- אין column-level encryption (pgcrypto לא בשימוש).
- אין Supabase RLS (Row Level Security מוערת/מבוטלת — 001:491-493).
- אין מסוף admin נפרד.
- האימיילים נשמרים plaintext. הטלפונים plaintext. הכתובות plaintext.
- `audit_log.previous_value` שומר JSON raw מלא.

**אין גם log redaction** — ה-`console.log('📱 WhatsApp from ${from}')` (server.js:896) מדפיס מספרי טלפון מלאים ל-stdout.

---

## 10. Data Subject Mapping

| Subject Type | טבלאות שמכילות אותו | כמות שדות PII | יכולת מחיקה |
|---|---|---|---|
| **Supplier (ספק)** | suppliers, supplier_products (FK), price_history (FK), rfq_recipients, supplier_quotes, purchase_orders, procurement_decisions, audit_log (previous_value), system_events (webhook), notifications (אם ה-recipient), supplier_dashboard (VIEW) | 9 שדות PII ישירים (name, contact_person, phone, email, whatsapp, address, notes, tags) + כ-5 שדות denormalized | **בלתי אפשרית** ללא מחיקה ידנית ב-11 טבלאות. אין endpoint. |
| **Subcontractor (קבלן משנה)** | subcontractors, subcontractor_pricing (FK), subcontractor_decisions (FK + denormalized name) | 5 שדות PII ישירים | בלתי אפשרית — אין endpoint, אין CASCADE על decisions |
| **Employee / Internal actor** | purchase_requests.requested_by, purchase_orders.requested_by + approved_by, audit_log.actor, procurement_decisions (indirect), subcontractor_decisions (indirect) | TEXT free-field בלבד (לא טבלת employees!) | אין — שדות חופשיים לא ניתנים למיפוי |
| **Client (לקוח סופי של Kobi)** | subcontractor_decisions.client_name, subcontractor_decisions.project_name (עלול להכיל שם) | 2 שדות | אין endpoint |
| **WhatsApp sender (random webhook sender)** | system_events.data.from, .text, .messageId, system_events.message | free-text log | אין |
| **Company HQ (Kobi's office)** | purchase_orders.delivery_address DEFAULT | 1 שדה hardcoded ב-schema | schema migration בלבד |

---

## 11. ממצאים קריטיים (Severity Ranking)

| # | חומרה | ממצא | קובץ:שורה |
|---|---|---|---|
| PII-1 | **CRITICAL** | audit_log.previous_value שומר snapshot מלא של row ספק כולל phone/email/address — PII-snapshot infinite retention, Right-to-Erasure בלתי אפשרי | server.js:99-105, 157-163 |
| PII-2 | **CRITICAL** | אין endpoint DELETE לספק/קבלן משנה. אין soft-delete אמיתי (רק `active=false` ללא deleted_at). | server.js (missing route) |
| PII-3 | **HIGH** | Seed data 002 משתמש בדומיינים `.co.il` שנראים אמיתיים (`tambour-dist.co.il`, `foshansteel.com`) — שליחה מ-production עלולה להגיע ליעד אמיתי | 002:23-42 |
| PII-4 | **HIGH** | WhatsApp webhook שומר `from` + `text` מלא של **כל** הודעה נכנסת (גם זרים) ב-system_events.data. אין filter, אין TTL. | server.js:886-896 |
| PII-5 | **HIGH** | אין phone normalization. sendWhatsApp מסיר אך ורק non-digit chars → `0501234567` נשלח כמו שהוא (לא +972), RFQ יושתק. | server.js:40 |
| PII-6 | **HIGH** | denormalized `supplier_name` בטבלאות rfq_recipients, supplier_quotes, purchase_orders, procurement_decisions → שם ספק נשאר לעד גם אחרי מחיקה ב-suppliers | 001:134, 153, 196, 264 |
| PII-7 | **MEDIUM** | delivery_address DEFAULT `'ריבל 37, תל אביב'` hardcoded בסכמה — כתובת משרד בקוד | 001:204 |
| PII-8 | **MEDIUM** | אין CHECK constraint או TRIGGER לוידוא פורמט טלפון/אימייל | 001:12-13 |
| PII-9 | **MEDIUM** | `console.log` של WhatsApp webhook מדפיס טלפונים ל-stdout | server.js:896 |
| PII-10 | **MEDIUM** | `notes` + `tags` שדות חופשיים — יכולים להכיל PII לא מובנה שלא ניתן לסרוק | 001:36-37, 286 |
| PII-11 | **MEDIUM** | supplier_dashboard VIEW חושף `phone` — כל endpoint `/api/suppliers` מחזיר phone מלא לכל קריאה GET | 001:456-475, server.js:130-137 |
| PII-12 | **LOW** | אין retention policy מוגדר בכלל — אף טבלה לא מגדירה TTL | all |
| PII-13 | **LOW** | email ו-phone nullable (email) ולא-null (phone) — חוסר עקביות עם סובקונטרקטורים (email null) מול ספקים (email nullable) | 001:13, 281 |
| PII-14 | **LOW** | procurement_decisions.reasoning JSONB כולל שמות ספקים ב-free text — ה-reasoning נוצר על ידי הקוד ב-server.js:507-521 | server.js:507-521 |
| PII-15 | **LOW** | notifications.recipient TEXT חופשי — יכול להכיל phone/email בלי צורה מובנית | 001:373 |

---

## 12. המלצות

1. **הוסף `deleted_at`, `deleted_by`, `deletion_reason`** לסוchemas של suppliers ו-subcontractors.
2. **צור SQL function `anonymize_supplier(id)`** שעושה `UPDATE suppliers SET name='REDACTED', phone='+972000000000', email=NULL, contact_person='REDACTED', address=NULL, whatsapp=NULL, notes='' WHERE id=...;` ומעדכנת גם denormalized fields בטבלאות התלויות.
3. **הסר PII מ-audit_log.previous_value** — אחסן רק רשימת שדות ששונו, לא ערכים. או: הצפן עם pgcrypto.
4. **נרמל טלפון בשרת** — הוסף `normalizePhone(p)` שבודקת `^\+972\d{9}$`.
5. **הוסף CHECK constraint**: `CHECK (phone ~ '^\+[0-9]{10,15}$')`.
6. **סנן WhatsApp webhook** — רק מספרים שקיימים ב-`suppliers.whatsapp` ישמרו ל-system_events.
7. **החלף seed data** לדומיינים `@example.com` ומספרים `+9725000000xx` (reserved test range).
8. **הוסף TTL ל-system_events** — cron יומי שמוחק events ישנים מ-90 יום.
9. **הסר `console.log` של `from` מ-webhook** או הסתר חלקית: `from.slice(0,6)+'***'`.
10. **צור Supabase RLS policy** לפני production.

---

## 13. סיכום עבודה

נבנה מלאי PII מלא של 6 סוגי Data Subjects, 33 שדות PII ב-14 טבלאות. נמצאו 15 ממצאים (2 CRITICAL, 5 HIGH, 5 MEDIUM, 3 LOW). הבעיה המערכתית: אין retention, אין מחיקה, אין נרמול, אין anonymization, אין GDPR/חוק הגנת הפרטיות 1981 compliance. audit_log + denormalized supplier_name הם שני מקורות leakage עיקריים לפרטיות.
