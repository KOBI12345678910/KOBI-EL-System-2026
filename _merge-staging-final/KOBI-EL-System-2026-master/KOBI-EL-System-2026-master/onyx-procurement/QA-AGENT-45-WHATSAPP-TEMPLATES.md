# QA Agent #45 — WhatsApp Template Compliance & Approval

**פרויקט:** onyx-procurement (טכנו כל עוזי בע"מ)
**תאריך ניתוח:** 2026-04-11
**היקף:** ניתוח סטטי בלבד של `server.js` (934 שורות) + חיפוש Glob לקבצי תבניות
**מימד בדיקה:** תאימות תבניות WhatsApp Business Cloud API + מצב אישורים מול Meta
**סוכן:** #45 (אין חפיפה עם `QA-WAVE1-DIRECT-FINDINGS.md` — שם אין התייחסות לתבניות/HSM)

---

## סיכום מנהלים (TL;DR)

**המערכת שולחת את כל ההודעות כ-`text` חופשי, ללא שימוש ב-Message Templates. זוהי הפרה מערכתית של Meta WhatsApp Business Policy** — הודעות חופשיות מותרות אך ורק בתוך חלון שירות־הלקוח של 24 שעות אחרי הודעה אחרונה מהספק. כל הודעה ביוזמה עסקית (RFQ, PO) חייבת להיות תבנית מאושרת מראש.

**הפועל המעשי:** ברגע ההפעלה הראשון בייצור — WhatsApp API יחזיר שגיאה `131026 (Message Undeliverable)` או `131047 (Re-engagement message)` על כל RFQ וכל PO, כי הספקים אף פעם לא יזמו שיחה קודם. **שליחת ההודעות לא תעבוד בכלל.**

אין בקוד שם תבנית, אין הגדרת משתנים, אין קובץ הגדרת תבניות, אין התייחסות לקטגוריה (Utility/Marketing/Auth), אין קוד שפה (`he` / `he_IL`), אין מעקב אחר Quality Rating, אין מנגנון Opt-in, ואין מודעות לחלון 24 השעות.

---

## 1 · שיטת ה-Send בפועל — כולה `text`, אין תבניות

### מיקום 1: `sendWhatsApp()` (שורות 36–69)
```js
async function sendWhatsApp(to, message) {
  const data = JSON.stringify({
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: to.replace(/[^0-9+]/g, ''),
    type: 'text',                              // ← קריטי: text, לא template
    text: { preview_url: false, body: message },
  });
  ...
  path: `/v21.0/${WA_PHONE_ID}/messages`,
```

**הפרה:**
- `type: 'text'` = הודעת Session (שירות לקוח) — מותרת **רק** בתוך חלון 24 שעות מרגע קבלת הודעה אחרונה מהמספר.
- **חסר** `type: 'template'` + אובייקט `template: { name, language, components }`.

### מיקום 2: `POST /api/rfqs/create-and-send` (שורה 262–322)
- בונה טקסט RFQ חופשי (שורות 262–276) כולל Markdown ואימוג'י ("━━━").
- שולח דרך `sendWhatsApp()` (שורה 296) → לכן `type: text`.
- **זו הודעה ביוזמה עסקית מובהקת (business-initiated)** — חייבת להיות Template (קטגוריית Utility).

### מיקום 3: `POST /api/purchase-orders/:id/send` (שורה 625–679)
- בונה טקסט PO חופשי (שורות 636–658) באורך ~500–700 תווים.
- שולח דרך `sendWhatsApp()` (שורה 664) → `type: text`.
- **גם זו הודעה ביוזמה עסקית** — חייבת Template (Utility).

### Webhook נכנס (שורות 860–902)
```js
app.post('/webhook/whatsapp', async (req, res) => { ... })
```
- מקבל הודעות ולוג. **אך אין תשתית שמתעדת `last_customer_message_at` לכל ספק** — כלומר גם אם איכשהו ספק שלח הודעה נכנסת, המערכת לא יודעת שהחלון של 24 שעות פתוח.

---

## 2 · ממצאים פר דרישת Meta

### F-01 · תבניות לא מוגדרות כלל בקוד · חומרה 🔴 קריטי-חסם
**מיקום:** `server.js` — חיפוש `template`/`hsm`/`body_text`/`language` החזיר 0 תוצאות בקוד השרת.
**Glob:** `**/*template*` → אין אף קובץ.
**משמעות:** אין שם תבנית (כמו `rfq_request_v1`, `po_confirmation_v1`), אין רישום משתנים, אין קוד שפה. **אי אפשר לקרוא ל-API עם template שלא מוגדר.**
**תיקון נדרש:** ליצור קובץ `templates/whatsapp-templates.json` המגדיר את רשימת התבניות + להחליף את `type:'text'` במבנה:
```js
type: 'template',
template: {
  name: 'rfq_request_v1',
  language: { code: 'he' },   // ראה F-04
  components: [{
    type: 'body',
    parameters: [
      { type: 'text', text: rfqId },
      { type: 'text', text: itemsList },
      { type: 'text', text: deadline.toLocaleDateString('he-IL') }
    ]
  }]
}
```

### F-02 · לא בוצע Submit ב-Meta Business Manager · חומרה 🔴 חסם תפעולי
**עדות נסיבתית:**
- אין `.env` variable עם `WHATSAPP_BUSINESS_ACCOUNT_ID` (WABA ID) — צריך כדי לגשת ל-Templates API.
- אין שימוש ב-endpoint `/{WABA_ID}/message_templates` (לא לקריאה, לא ליצירה).
- אין קובץ מפרט תבניות, אין תיעוד של process.
**הסתברות גבוהה:** קובי עדיין לא הגיש תבניות לאישור Meta. זמן אישור ממוצע: 1–24 שעות, אבל יכול להגיע ל-7 ימים ולדרוש מחזורי דחייה-ותיקון.
**תיקון נדרש:** להגיש ב-Business Manager → WhatsApp Manager → Message Templates את:
1. `rfq_request_v1` (Utility, `he`)
2. `po_confirmation_v1` (Utility, `he`)
3. `po_status_update_v1` (Utility, `he`) — ל-future use
4. `payment_reminder_v1` (Utility, `he`) — ל-future use

### F-03 · טעות קטגוריה אפשרית · חומרה 🟡 בינוני
**הבהרה:** PO/RFQ הם Utility (עסקה קיימת / בקשה של השירות) — לא Marketing. אסור לסמן Marketing כי:
- דורש בדיקה נוקשה יותר.
- דורש Opt-in אקטיבי עם hash.
- כפוף למגבלות מקיפות יותר.
- עלול לחטוף Quality Rating Low מהר.

**Authentication** מוגבל ל-OTP בלבד — לא רלוונטי כאן.

**פעולה:** בעת ה-submit, קטגוריה = **Utility** + language = **`he`**. אם Meta ידחה עם הודעה "This looks like marketing" — לערוך את ה-body להיות יבש יותר ("הודעה מטכנו כל עוזי" ולא "!!! הצעת המחיר הטובה ביותר !!!").

### F-04 · קוד שפה לא מוגדר — `he` או `he_IL`? · חומרה 🟡 בינוני
**עובדה:** Meta תומך ב-`he` בלבד (ללא locale). שימוש ב-`he_IL` יחזיר שגיאה `132001 (Template not found)` גם אם התבנית קיימת.
**מיקום:** אין בקוד `language: { code: ... }` כלל.
**תיקון:** **תמיד** להשתמש ב-`he` — לעולם לא ב-`he_IL`.

### F-05 · ספירת משתנים לא ניתנת לאימות סטטי · חומרה 🟠 גבוה
**עובדה:** Meta דוחה קריאה עם שגיאה `132000 (Number of parameters does not match)` אם מספר ה-`{{1}}, {{2}}...` בתבנית ≠ מספר ה-`parameters[]` בקריאה.
**ב-PO** הטקסט מכיל כ-12 שדות משתנים (ספק, תאריך, פריטים, subtotal, delivery, vat, total, expected, payment_terms, address) — אבל `itemsList` הוא מחרוזת ארוכה עם \n ולא מערך פרמטרים.
**הגבלה קריטית של Meta:** פרמטר בודד בתבנית **לא יכול להכיל `\n`, `\t`, או יותר מ-4 רווחים רצופים**. כלומר אי אפשר לדחוף את כל הפריטים לפרמטר אחד — יש לבנות תבנית אחרת:
- או **תבנית קבועה + Interactive List Message** שמכיל את הפריטים
- או **לפצל לשליחה של תבנית header + N פריטים נפרדים** (לא יעיל)
- או **להשתמש ב-Media Template** עם קובץ PDF מצורף שמכיל את כל הפריטים (ראה F-10)

### F-06 · אפס מנגנון Opt-in / Opt-out · חומרה 🔴 הפרת מדיניות
**מיקום:** `server.js` — אין טבלה `whatsapp_opt_ins`, אין בדיקה של הסכמה לפני שליחה, אין handler להודעה נכנסת עם "STOP" / "הפסק".
**דרישת Meta:** לפני שליחת תבנית ביוזמה עסקית חובה לקבל הסכמה ברורה מהנמען בערוץ מחוץ ל-WhatsApp (טופס אתר, אימייל, הסכם רכש, שיחה).
**סיכון:** ספק שלא רוצה לקבל הודעות יכול לדווח כ-Spam → שחיקת Quality Rating → השהיית תבניות → Phone Number Paused.
**תיקון נדרש (יחד עם B-03 מ-WAVE1):**
1. טבלה `supplier_whatsapp_consent` עם `consented_at`, `consent_source`, `opted_out_at`.
2. בדיקה ב-`POST /api/rfqs/create-and-send` לפני שליחה: `if (!supplier.wa_consented) skip`.
3. Webhook handler שמזהה "הפסק"/"בטל"/"STOP"/"UNSUBSCRIBE" ומעדכן `opted_out_at`.

### F-07 · אפס מודעות לחלון 24 שעות · חומרה 🔴 קריטי
**מיקום:** `server.js:876–902` — webhook מקבל הודעות נכנסות אבל **לא מעדכן שדה `last_inbound_at` בטבלת `suppliers`.**
**משמעות:** גם אם ספק ישלח הודעה נכנסת ויפתח את חלון ה-24 שעות, המערכת לא יודעת לזהות שהחלון פתוח ועדיין לא תשלח `type:text`.
**תיקון נדרש:**
1. להוסיף עמודה `last_inbound_at TIMESTAMPTZ` לטבלת `suppliers`.
2. ב-webhook: כש-`from` מזוהה כספק, לעדכן `last_inbound_at = now()`.
3. ב-`sendWhatsApp()`: לקבל פרמטר `{ allowFreeText: bool }`. אם `last_inbound_at > now() - 24h` → מותר `text`, אחרת → חובה `template`.

### F-08 · גבולות אורך תבניות — PO גדול מהמכסה · חומרה 🟡 בינוני
**עובדות:**
- **Body:** 1024 תווים (לא 550 — Meta עדכנה ב-2024).
- **Header text:** 60 תווים.
- **Footer:** 60 תווים.
- **Button:** 25 תווים לטקסט, 2000 לכתובת URL.
- **Header media:** עד 16MB תמונה / 100MB וידאו / 100MB מסמך.
**מצב בקוד:** ה-PO שנבנה בשורות 636–658 כולל ~15 שורות × ~40 תווים = ~600–700 תווים, **עדיין מתחת ל-1024**. אבל אם יש PO עם 20 פריטים שורה כל אחד, זה חוצה את ה-1024.
**תיקון:** להעביר את רשימת הפריטים ל-**media template** עם PDF מצורף (ראה F-10).

### F-09 · אי-שימוש ב-Quick Reply Buttons · חומרה 🟢 נמוך
**הזדמנות:** ב-RFQ אפשר להוסיף `quick_reply` כפתורים: "✅ שולח הצעה", "❌ מתנצל, לא זמין". זה מכפיל את שיעור התגובה, מקטין overhead על הספק, ומשפר את ה-Quality Rating כי ספקים מגיבים במקום להתעלם.
**מצב נוכחי:** אפס שימוש ב-`components.type:'button'`.
**תיקון:** לכלול בתבנית `rfq_request_v1` שני `quick_reply` buttons.

### F-10 · Media Header לא בשימוש · חומרה 🟢 נמוך (הזדמנות)
**מצב:** אין שימוש ב-header עם תמונה/PDF.
**הזדמנות:**
- PO template עם header = PDF מצורף של ההזמנה המלאה. זה פותר את הגבלת 1024 התווים **וגם** את הגבלת ה-`\n` בפרמטרים (F-05).
- ליטוש מותג: header image עם לוגו "טכנו כל עוזי" → נראות מקצועית, אמון ספק גבוה יותר.
**תיקון:** להגדיר `po_confirmation_v1` כ-**Document template** עם header document.

### F-11 · Quality Rating — אפס tracking · חומרה 🟠 גבוה
**עובדה:** Meta דוחף Quality Rating לכל מספר טלפון: `GREEN`/`YELLOW`/`RED` + Messaging Limit Tier (`TIER_1K`/`TIER_10K`/`TIER_100K`/`TIER_UNLIMITED`).
**סיכון:** אם Quality נופל ל-RED, Meta **משהה את המספר** למשך 24 שעות → כל שליחה נדחית עד שהוא חוזר ל-YELLOW.
**מצב בקוד:** אין קריאה ל-endpoint `/{phone_id}?fields=quality_rating,messaging_limit`, אין לוג, אין דשבורד.
**תיקון נדרש:**
1. Cron job כל 6 שעות: `GET /{phone_id}?fields=quality_rating,throughput,name_status`.
2. טבלה `whatsapp_health_log` שמאחסנת את התוצאות.
3. התראה אוטומטית (שליחה לסלאק/טלגרם של קובי) כש-rating ≠ `GREEN`.

### F-12 · Throughput / Rate Limiting לא ממומשים · חומרה 🟠 גבוה
**מצב:** בלולאת שליחה ב-`POST /api/rfqs/create-and-send` (שורות 289–321), השרת שולח בלולאת `for` רציפה ללא `await sleep()` בין משלוחים.
**סיכון:** אם קובי יוסיף 100 ספקים לקטגוריה, הלולאה תירה 100 קריאות API ברצף. Tier 1K = 1,000 שיחות ייחודיות ב-24h, אבל burst rate = 80 req/sec. ב-100 ספקים זה עובר אבל מעבר לזה יש סיכוי לחטוף `131056 (Rate limit hit)`.
**תיקון:** Queue בסגנון P-Queue עם concurrency=5, או `await new Promise(r => setTimeout(r, 100))` בין איטרציות.

### F-13 · Phone Number Quality Rating — אין רישום של Display Name Status · חומרה 🟠 גבוה
**עובדה:** Meta דורשת אישור של **Display Name** (עובר review ידני של Facebook) לפני שניתן לשלוח ביוזמה עסקית בנפחים גבוהים.
**שאלה:** האם `WA_PHONE_ID` השייך לקובי כבר יש לו `name_status = APPROVED`? בקוד אין רמז.
**פעולה:** ב-Business Manager לאמת:
- שם תצוגה (Display Name) = "טכנו כל עוזי" או "Techno Kol Uzi"
- Name Status = APPROVED (לא PENDING/REJECTED)
- כתובת עסקית מאומתת
- תחום עיסוק מוגדר (BUSINESS)

### F-14 · סיכון להשהיית תבניות · חומרה 🟠 גבוה
**מנגנון Meta:** תבנית שמקבלת יותר מדי "Block" או "Report" → עוברת ל-`PAUSED` למשך 3 שעות. אחרי 2 השהיות רצופות → `DISABLED` (נמחקת לתמיד ומצריכה הגשה מחדש).
**מצב בקוד:** אין מעקב אחרי סטטוס תבנית, אין fallback אוטומטי ל-SMS כשתבנית PAUSED.
**תיקון נדרש:**
1. Cron כל שעה: `GET /{WABA_ID}/message_templates` → סנן `status = PAUSED/DISABLED`.
2. אם תבנית מרכזית (`rfq_request_v1`) מושהית → אוטומטית לעבור ל-SMS דרך Twilio (יש כבר `sendSMS()` בשורה 71).
3. התראה לקובי.

### F-15 · אין תרגום/ריבוי שפות — אבל RTL מטופל נכון · חומרה 🟢 הערה
**חיובי:** הטקסטים בעברית RTL, יכולים לעבוד בתוך תבנית עברית. WhatsApp תומך ב-RTL אוטומטית. אין צורך ב-`&rlm;` / `&lrm;`.

---

## 3 · טבלת חומרה מסכמת

| # | ממצא | חומרה | חסם ייצור? |
|---|---|---|---|
| F-01 | אין הגדרת תבניות בקוד | 🔴 קריטי | כן |
| F-02 | לא בוצע Submit ב-Meta BM | 🔴 חסם | כן |
| F-06 | אפס Opt-in/Opt-out | 🔴 הפרת מדיניות | כן |
| F-07 | אפס מודעות לחלון 24h | 🔴 קריטי | כן |
| F-05 | ספירת משתנים + `\n` בפרמטרים | 🟠 גבוה | כן (אחרי F-01) |
| F-11 | אפס Quality Rating tracking | 🟠 גבוה | לא (אך מסוכן) |
| F-12 | Throughput ללא rate limit | 🟠 גבוה | לא |
| F-13 | Display Name Status לא מאומת | 🟠 גבוה | אפשרי |
| F-14 | אין סיכוי לזיהוי תבנית PAUSED | 🟠 גבוה | לא |
| F-03 | קטגוריה לא מוגדרת (Utility) | 🟡 בינוני | לא |
| F-04 | קוד שפה `he` vs `he_IL` | 🟡 בינוני | כן |
| F-08 | PO עלול לחרוג מ-1024 תווים | 🟡 בינוני | לא |
| F-09 | אין Quick Reply buttons | 🟢 נמוך | לא |
| F-10 | אין Media/Document header | 🟢 נמוך | לא |
| F-15 | RTL עברית | 🟢 תקין | לא |

---

## 4 · תוכנית תיקון מומלצת (סדר עבודה)

**שלב A — Blocker Remediation (לפני שליחה ראשונה בייצור):**
1. להגיש 2 תבניות ב-Meta Business Manager: `rfq_request_v1` + `po_confirmation_v1` — קטגוריה Utility, שפה `he`.
2. להוסיף `WHATSAPP_BUSINESS_ACCOUNT_ID` ל-`.env.example` ול-SETUP-GUIDE.
3. לשדרג `sendWhatsApp()` לקבל פרמטר `templateName` ולבנות payload של `type:'template'`.
4. להוסיף בדיקה של `last_inbound_at` — אם טרי מ-24h, מותר text; אחרת חובה template.

**שלב B — Compliance (תוך שבוע):**
5. טבלת Opt-in + בדיקה לפני שליחה.
6. Webhook handler ל-"הפסק"/"STOP".
7. עמודת `last_inbound_at` + עדכון מה-webhook.

**שלב C — Observability (תוך חודש):**
8. Cron Quality Rating + Template Status.
9. Rate limiter בלולאת RFQ.
10. Fallback ל-SMS כשתבנית PAUSED.

**שלב D — ליטוש (אופציונלי):**
11. Media template עם PDF ל-PO.
12. Quick Reply buttons ל-RFQ.

---

## 5 · Checklist למפתח (להדביק כ-Issue ב-GitHub)

- [ ] `.env.example`: הוספת `WHATSAPP_BUSINESS_ACCOUNT_ID`
- [ ] `server.js:36`: `sendWhatsApp` — תמיכה ב-`templateName` + `templateParams`
- [ ] `server.js:262`: RFQ message — להפוך ל-template
- [ ] `server.js:636`: PO message — להפוך ל-media template (PDF header)
- [ ] `server.js:876`: webhook — לעדכן `last_inbound_at`
- [ ] `supabase/migrations/XX_whatsapp_compliance.sql`: טבלת consent + עמודות health
- [ ] `scripts/submit-templates.js`: סקריפט submit דרך API
- [ ] `scripts/check-wa-health.js`: cron מצב Quality+Templates
- [ ] Meta Business Manager: הגשה + אישור 2 תבניות
- [ ] Meta Business Manager: אישור Display Name "טכנו כל עוזי"
- [ ] בדיקה end-to-end עם ספק test: opt-in → RFQ template → תשובה → session window → text follow-up

---

**סטטוס:** 🔴 **לא מוכן לייצור** — שליחת WhatsApp חסומה ע"י Meta ברגע שינסו להריץ על ספק אמיתי שלא יזם שיחה קודם.

**מעריך:** QA Agent #45 · Static Analysis Only · No runtime execution
