# QA Agent #26 — ציות ל-GDPR / פרטיות האיחוד האירופי

**פרויקט:** onyx-procurement
**תאריך בדיקה:** 2026-04-11
**סוג בדיקה:** Static Analysis בלבד
**מימד:** GDPR / EU Privacy Compliance
**קבצים שנבחנו:**
- `supabase/migrations/001-supabase-schema.sql`
- `supabase/migrations/002-seed-data-extended.sql`
- `server.js`

---

## 1. היקף החשיפה ל-GDPR (Scope Analysis)

### מה מאוחסן במערכת (נתונים אישיים לפי Art. 4(1))
טבלת `suppliers` ו-`subcontractors` מכילה נתונים אישיים של **אנשי קשר פיזיים** אצל הספקים:
- `contact_person` — שם מלא של נציג
- `phone`, `whatsapp` — מספרי טלפון אישיים
- `email` — כתובת דוא"ל אישית
- `address` — כתובת פיזית (אם של אדם פרטי — נתון אישי; אם של תאגיד — לא)
- `notes` — שדה חופשי העלול להכיל דעות, שיוכים או נתוני רגישות

גם `purchase_requests.requested_by`, `purchase_orders.approved_by/requested_by`, `audit_log.actor` הם **נתוני עובדים** של "טכנו כל עוזי" — גם אלה Data Subjects.

### מי ה-Data Subjects
1. **עובדי Data Controller** (טכנו כל עוזי) — בישראל, תחת ה-PPL הישראלי + החלטת נאותות EU↔IL (2011/61/EU).
2. **אנשי קשר של ספקים ישראליים** (12 מתוך 13 הספקים ב-seed) — גם תחת ה-PPL.
3. **איש קשר סיני** — `David Wang` @ `Foshan Steel Trading` (`country = 'סין'`) — לא Data Subject של GDPR (GDPR חל רק על Data Subjects **in the Union**; אין נגיעה לאיחוד). עם זאת, חוקי PIPL הסיני עלולים לחול.

### כמות חשיפה ל-GDPR
**נמוכה עד אפסית בהגדרה הנוכחית.** כל הספקים כיום בישראל/סין, וכל העובדים בישראל. עם זאת, הטבלאות (`country TEXT` ללא אכיפה) מאפשרות בקלות להוסיף ספק איטלקי/גרמני מחר — ואז כל הטבלה נכנסת לתחולת GDPR מלאה. מוצר שמיועד להתרחב יחשוף במהירות פער.

**חומרה:** MEDIUM (לא קריטי מיד, אבל חוב־מבנה)

---

## 2. Article 5 — Lawfulness, Fairness, Transparency (שקיפות)

### ממצא GDPR-01 — **[HIGH] אין Privacy Notice בשום מקום במערכת**
סריקה הראתה שאין שום מסמך פרטיות, אין אזכור ל-privacy, gdpr, או data protection בכל קוד ה-server או ה-schema (רק אזכורי testing במסמכי QA אחרים). משמעות:
- Art. 5(1)(a) (lawfulness/transparency) — לא מתקיים
- Art. 12 (transparent information) — לא מתקיים
- Art. 13 (information at collection) — לא מתקיים

**איפה:** root directory — אין `PRIVACY.md`, `/privacy` endpoint, אין privacy banner.
**חומרה:** HIGH אם יורחב ל-EU; MEDIUM כרגע.
**תיקון:** ליצור `PRIVACY.md` קצר + endpoint `GET /privacy` המחזיר:
- זהות Controller ("טכנו כל עוזי בע"מ")
- פרטי קשר DPO / אחראי פרטיות
- מטרות עיבוד (ניהול רכש, RFQ, הצעות מחיר, הזמנות)
- בסיס חוקי (Art. 6(1)(b) ביצוע חוזה / Art. 6(1)(f) אינטרס לגיטימי B2B)
- תקופות שמירה
- זכויות Data Subject
- פרטי רשות פיקוח (רש"פ בישראל, או ה-DPA הרלוונטי ב-EU)

---

## 3. Article 6 — Lawful Basis (בסיס חוקי לעיבוד)

### ממצא GDPR-02 — **[LOW] הבסיס החוקי לא תועד אך כנראה תקין**
עיבוד נתוני איש קשר של ספק למטרת RFQ/רכש נופל סביר ב:
- **Art. 6(1)(b)** — ביצוע חוזה (כאשר קיים קשר מסחרי) או פעולות טרום-חוזיות לבקשת הספק (RFQ).
- **Art. 6(1)(f)** — אינטרס לגיטימי B2B (כאשר אין חוזה עדיין).

**בעיה:** אין תיעוד של הבחירה, ואין LIA (Legitimate Interests Assessment) אם נבחר 6(1)(f).
**חומרה:** LOW
**תיקון:** להוסיף ל-`PRIVACY.md` טבלת עיבוד עם בסיס חוקי לכל פעולה. אם בוחרים אינטרס לגיטימי — לכתוב LIA קצר.

---

## 4. Articles 13/14 — Information to Data Subjects

### ממצא GDPR-03 — **[HIGH] אין notice-on-first-contact**
בעת שליחת RFQ ראשון לספק חדש (`POST /api/rfq/send` → `sendWhatsApp` ב-`server.js:226-344`), ההודעה ב-`messageText` לא כוללת:
- הודעה שהנתונים שלהם (שם, טלפון, email) מאוחסנים במערכת
- קישור למדיניות פרטיות
- זכויותיהם

**דרישה:** Art. 14(3)(a) דורש לספק את המידע ב-contact ראשון (לפחות) — **תוך חודש**.
**חומרה:** HIGH (אם ייעבדו נתוני EU)
**תיקון:** להוסיף שורת-פוטר להודעות WhatsApp/Email:
```
נתוני הקשר שלך מטופלים עבור ניהול רכש בלבד. למדיניות מלאה: https://…/privacy
```

---

## 5. Article 15 — Right of Access

### ממצא GDPR-04 — **[HIGH] אין endpoint ל-DSAR (Data Subject Access Request)**
אין endpoint בטיפוס `GET /api/gdpr/my-data?phone=+972...` או דומה. אם ספק ישאל "איזה מידע יש לכם עלי?" — אין מנגנון אוטומטי לייצא.
Art. 15 דורש עותק של **כל** הנתונים המעובדים, כולל:
- רשומת `suppliers` עצמה
- `audit_log` (רלוונטי לכל פעולה שבוצעה)
- `price_history` (קשור ל-supplier_id)
- `rfq_recipients`, `supplier_quotes`, `purchase_orders` — כולם מכילים `supplier_id`
- `system_events` של WhatsApp incoming — שמכילים `from` (נתון אישי) ב-`webhook/whatsapp`

**חומרה:** HIGH (אם ייעבדו נתוני EU)
**תיקון:** להוסיף:
```js
GET /api/gdpr/access/:supplier_id → מחזיר JSON עם כל הטבלאות המקושרות.
```

---

## 6. Article 17 — Right to Erasure ("Right to be Forgotten")

### ממצא GDPR-05 — **[CRITICAL] אין כלל DELETE endpoint לספקים או נתוני קשר**
סריקה ב-`server.js` על `delete`, `DELETE`, `erase` — **אפס התאמות**. אין שום endpoint מחיקה.
בפועל, `active: boolean` ב-`suppliers` מיועד ל-soft-delete, אבל זה לא מוחק את הנתונים האישיים.

### ממצא GDPR-06 — **[HIGH] בעיית Cascade / שלמות הפניות**
ב-`001-supabase-schema.sql`, ישנם `ON DELETE CASCADE` ל:
- `supplier_products.supplier_id` (שורה 46)
- `price_history.supplier_id` (שורה 67)
- `rfq_recipients.rfq_id` (שורה 132)
- `po_line_items.po_id` (שורה 239)
- `quote_line_items.quote_id` (שורה 176)
- `purchase_request_items.request_id` (שורה 99)
- `subcontractor_pricing.subcontractor_id` (שורה 299)

**אבל** אלה הטבלאות הבאות **אין להן CASCADE** על `suppliers`:
- `rfq_recipients.supplier_id` (FK רגיל, ללא ON DELETE)
- `supplier_quotes.supplier_id`
- `purchase_orders.supplier_id`
- `procurement_decisions.selected_supplier_id`
- `subcontractor_decisions.selected_subcontractor_id`

משמעות: `DELETE FROM suppliers WHERE id = '…'` **ייכשל** עם FK violation אם יש אי פעם הזמנה. זה הופך את סעיף 17 לבלתי ניתן ליישום בפועל.

**חומרה:** CRITICAL (זכות 17 היא זכות הליבה של GDPR)
**תיקון מומלץ:**
1. להפריד בין "נתונים אישיים" (phone, email, contact_person) ל"נתוני ישות משפטית" (name, country, payment_terms).
2. ליצור פעולת **anonymize**: `UPDATE suppliers SET contact_person='[deleted]', phone='[deleted]', email=NULL, whatsapp=NULL, notes='' WHERE id=…` — הרשומה נשארת עבור שלמות היסטורית של הזמנות, אבל PII נמחק.
3. לנקות גם מ-`audit_log.detail/new_value` שעלול להכיל שם איש קשר ו-phone.
4. לנקות את `system_events` שמכיל `from` (phone) בהודעות WhatsApp נכנסות (שורה 886-898 ב-server.js).

---

## 7. Article 25 — Privacy by Design & Data Minimization

### ממצא GDPR-07 — **[MEDIUM] Data Minimization חלקית**
טבלת `suppliers`:
- `notes TEXT` — שדה חופשי פתוח לגמרי. ישנם ערכים ב-seed כמו "ספק ותיק ואמין, מחירים טובים על כמויות", "מומחים באלומיניום — איכות מעולה". אלה לגיטימיים.
- אבל גם: "לפעמים איחורים", "רחוק ואיטי" — אלה **שיפוטי ערך** של אדם. עלולים להיחשב לדעות אישיות ולהיות רלוונטיים לזכות תיקון (Art. 16) ואפילו לזכות התנגדות (Art. 21).
- `rating`, `delivery_reliability`, `quality_score`, `risk_score` — פרופיילינג של הספק וביחס ליחיד (contact_person) — ייתכן שחל Art. 22 (אוטומציה).

### ממצא GDPR-08 — **[MEDIUM] חוסר הפרדה בין B2B ל-PII**
`contact_person` נשמר כ-TEXT רגיל כשהספק הוא בעצם **תאגיד**. מינימיזציה אמיתית תדרוש:
- שם הספק (תאגיד) חובה
- איש קשר אופציונלי, ניתן למחיקה נפרדת

**חומרה:** MEDIUM
**תיקון:** לצמצם את `notes` לשדות מובנים (rating + tags + comment_type), ולספק הפרדה ברורה בין השדה `contact_person` ל-`legal_entity_name`.

### ממצא GDPR-09 — **[HIGH] אין מדיניות Retention**
אין מדיניות שמירה. רשומות נשארות **לנצח**. Art. 5(1)(e) דורש storage limitation. ספק שלא עובדים איתו 10 שנים — נתוני ה-PII שלו עדיין במערכת.
**תיקון:** להוסיף עמודה `retention_until TIMESTAMPTZ` + cron-job אוטומטי לאנונימיזציה אחרי X שנים חוסר פעילות (למשל 3 שנים, כמקובל ב-B2B).

---

## 8. Article 30 — Records of Processing Activities (ROPA)

### ממצא GDPR-10 — **[HIGH] אין ROPA**
GDPR Art. 30 דורש מ-Controllers (אפילו SMB מעל 250 עובדים או בכל גודל אם העיבוד הוא "not occasional") לתעד את כל פעילויות העיבוד. לא קיים שום קובץ ROPA בפרויקט.
**חומרה:** HIGH (תוצאה של הרחבה ל-EU)
**תיקון:** ליצור `ROPA.md` עם טבלה:
| מטרה | קטגוריות Data Subjects | קטגוריות נתונים | נמענים | העברות בינ"ל | תקופת שמירה | אמצעי אבטחה |

---

## 9. Article 32 — Security of Processing

### ממצא GDPR-11 — **[HIGH] נושא מועבר ל-Agent #29 (Encryption)**
עניין הצפנה נכסה על-ידי agent ייעודי. כאן נציין רק היבטים תהליכיים:
- **אין RLS מופעל** — שורות 491-493 במiגרציה 001: `ALTER TABLE … ENABLE ROW LEVEL SECURITY` מוער בהערה. כל מי שיש לו anon key יכול לקרוא הכל. Art. 32(1)(b) דורש "confidentiality".
- שימוש ב-`SUPABASE_ANON_KEY` ב-server (שורה 25) — זה key ציבורי ללא הרשאות מוגבלות.
- אין rate limiting, אין auth middleware לפני הראוטים.
- אין Data Processing Agreement (DPA) מתועד עם Supabase — Art. 28 דורש DPA מול כל Processor.

**חומרה:** HIGH
**תיקון מינימלי:** להפעיל RLS, לעבור ל-service_role key בצד שרת, לחתום DPA מול Supabase (קיים סטנדרטי ב-supabase.com/legal).

### ממצא GDPR-12 — **[CRITICAL] WhatsApp Token + Twilio Token ב-environment**
`WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID`, `TWILIO_AUTH_TOKEN` — צריכים להיות ב-secret manager, לא `.env` גלוי. אם דלף, תוקף יכול לשלוח הודעות בשם הארגון ו**לפגוע ב-Data Subjects**.
**חומרה:** CRITICAL
**תיקון:** להעביר ל-Supabase secrets / Vercel env / AWS Secrets Manager.

---

## 10. Articles 33/34 — Breach Notification (דיווח על פרצה)

### ממצא GDPR-13 — **[HIGH] אין נוהל דיווח פרצה 72 שעות**
אין שום תיעוד של:
- מי Data Protection Officer / איש קשר לרשות פיקוח
- כתובת / תיבת דואר ל"חשודים בדליפה"
- template ל-breach report
- מנגנון monitoring שמסמן אירועי חריגה (למשל 1000 קריאות פתאומיות ל-`/api/suppliers`)

טבלת `system_events` קיימת עם `severity: 'critical'` — אבל אין מנגנון שמפעיל התראה בפועל. אין trigger על קריאות חריגות.

**חומרה:** HIGH (אם הרחבה ל-EU + פרצה אמיתית → קנסות עד 4% מחזור שנתי)
**תיקון:**
1. לתעד ב-`INCIDENT-RESPONSE.md` את 10 השלבים הראשונים.
2. ה-72 שעות מתחילות מרגע שה-Controller "הפך מודע לפרצה" (Art. 33(1)).
3. להקים email אחד — `privacy@techno-kol.co.il` או דומה — שנדחף ב-`PRIVACY.md`.

---

## 11. Article 44 — International Data Transfers

### ממצא GDPR-14 — **[LOW] ישראל — החלטת נאותות קיימת (2011)**
כל הספקים הישראליים (12 מתוך 13) — EU↔Israel transfers מותרים ללא SCCs לפי 2011/61/EU (החלטת נאותות). **אין ממצא.**

### ממצא GDPR-15 — **[MEDIUM] Foshan Steel (סין) — אין Data Subject EU במעורב**
הספק `Foshan Steel Trading`, `country = 'סין'`, איש קשר `David Wang`. כאן שתי שאלות נפרדות:
1. **האם Art. 44 חל?** — רק אם מעבירים אליו נתונים **של Data Subjects אירופיים**. כרגע, אנחנו שולחים RFQ עם נתוני פריטים, לא נתוני אדם. זה לא transfer של personal data.
2. **האם `David Wang` עצמו מוגן?** — לא תחת GDPR (הוא בסין, לא באיחוד). PIPL הסיני יכול לחול, אבל זה **מחוץ לתחום GDPR dimension** של הבדיקה הזו.

**אבל** — הממצא הבא רלוונטי:

### ממצא GDPR-16 — **[MEDIUM] Supabase כ-Processor — יש לוודא מיקום הנתונים**
Supabase מארח ב-AWS באזורים שונים. אם הפרויקט פועל באזור `us-east-1` או דומה, יש transfer מ-EU ל-US. Schrems II מחייב:
- SCCs 2021/914
- TIA (Transfer Impact Assessment)
- ואמצעי השלמה (supplementary measures) — הצפנה בהגדרת storage + מפתחות אצל הלקוח.

**חומרה:** MEDIUM
**תיקון:** לוודא שפרויקט Supabase נוצר באזור EU (`eu-west-1` / `eu-central-1`). לתעד את האזור ב-README.

---

## 12. Article 22 — Automated Decision-Making

### ממצא GDPR-17 — **[MEDIUM] האלגוריתם `POST /api/rfq/:id/decide` הוא automated decision**
שורות 425-593 ב-server.js: **האלגוריתם בוחר ספק בלעדית** לפי weighted_score. זו **החלטה אוטומטית** לפי Art. 22(1) — "solely automated" — מול Data Subject (איש קשר הספק המפסיד).
אמנם זה B2B אבל Art. 22 לא מבחין. הדרישות:
- זכות התערבות אנושית
- זכות להסביר את הלוגיקה (ה-`reasoning` JSONB זה חצי תשובה — לא מספיק)
- זכות לערער

**חומרה:** MEDIUM
**תיקון:** לפני `INSERT INTO purchase_orders … status='draft'`, להוסיף `status='pending_approval'` ולדרוש approver אנושי (קיים `POST /api/purchase-orders/:id/approve`) — זה **כבר** מרכיב Human-in-the-Loop סביר. **להבהיר מפורשות** שה-`decide` הוא Recommendation ולא Decision Final.

---

## 13. ממצאים נוספים נקודתיים

### GDPR-18 — **[LOW] `audit_log.detail` מכיל שמות**
דוגמה: `server.js:152` → `"ספק חדש: ${data.name}"`. ב-`audit_log` מאוחסן גם שם איש קשר בפעולות שונות. בעת מחיקה/אנונימיזציה יש לסרוק גם את ה-JSONB ב-`previous_value`/`new_value`.

### GDPR-19 — **[LOW] `system_events.data` מכיל WhatsApp phone**
`server.js:888-894`: webhook WhatsApp נכנס → insert `data: { from, text, …}`. `from` הוא מספר טלפון אישי. זה PII מתמשך ללא retention policy.
**תיקון:** לאחסן hash של phone במקום raw phone, או retention של 30 ימים ואז מחיקה.

### GDPR-20 — **[INFO] חוקיות ישראלית נפרדת**
הבדיקה מכסה GDPR בלבד. יש לזכור שחוק הגנת הפרטיות הישראלי (תיקון 13, נכנס לתוקף אוגוסט 2025) הטיל דרישות דומות — Privacy Notice, DSAR, Breach Notification. גם אם GDPR לא חל — ה-PPL חל על כל הספקים הישראלים. **זה מחוץ לתחום ה-GDPR dimension אבל שווה להעלות כ-meta-finding.**

---

## סיכום חומרות

| חומרה | מספר ממצאים |
|---|---|
| CRITICAL | 2 (GDPR-05 מחיקה, GDPR-12 secrets) |
| HIGH | 7 (01, 03, 04, 06, 09, 10, 11, 13) |
| MEDIUM | 6 (07, 08, 15, 16, 17) |
| LOW | 4 (02, 14, 18, 19) |
| INFO | 1 (20) |

**סך הכול:** 20 ממצאים ייחודיים.

## המלצת עדיפויות (טופ 5)
1. **GDPR-05:** להוסיף מנגנון anonymize/erase לספקים.
2. **GDPR-12:** להעביר WhatsApp/Twilio tokens ל-secret manager.
3. **GDPR-11:** להפעיל RLS + לחתום DPA עם Supabase.
4. **GDPR-01:** ליצור `PRIVACY.md` + endpoint `/privacy`.
5. **GDPR-09:** לקבוע retention policy ולאוטומט anonymization אחרי 3 שנים חוסר פעילות.

## הערה כללית
המערכת כרגע **לא חשופה ישירות ל-GDPR** כי כל הספקים ישראליים/סיניים — אבל **כל הארכיטקטורה לא מוכנה** להרחבה עתידית ל-EU. הממצאים כאן הם "חוב תכנון" שכדאי לטפל לפני Go-Live של לקוח EU ראשון.

---
*QA Agent #26 — Static Analysis Only — 2026-04-11*
