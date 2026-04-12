# QA Agent 50 — Audit Trail Completeness & Forensics
**פרויקט:** onyx-procurement
**תאריך:** 2026-04-11
**ממד:** שלמות לוג הביקורת, התנגדות לזיופים, ו-Forensics משפטי
**קבצים שנבחנו:**
- `supabase/migrations/001-supabase-schema.sql` (טבלאות `audit_log`, `system_events`)
- `server.js` (כל הקריאות ל-`audit()` וכל ה-state-changing endpoints)

---

## 1. מבנה טבלת `audit_log` (schema lines 338-351)

```sql
CREATE TABLE audit_log (
  id UUID PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  action TEXT NOT NULL,
  actor TEXT NOT NULL,
  detail TEXT,
  previous_value JSONB,
  new_value JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### עמודות קיימות
| שדה | קיים? | הערות |
|---|---|---|
| actor | כן (TEXT חופשי) | אין FK, אין ולידציה — ניתן לזייף |
| action | כן | רק `created/updated/sent/approved/received/decided` |
| target (entity_type+entity_id) | כן | אבל `entity_id` הוא UUID nullable |
| prev_value | כן (JSONB) | רק בעדכון ספק (שורה 161) — בכל שאר המקומות לא מועבר |
| new_value | כן (JSONB) | שם הטבלה עצמו `new_value` ללא FK |
| timestamp | `created_at` TIMESTAMPTZ | רזולוציה ברמת ms (TZ-aware — טוב) |
| ip_address | **חסר** | אין לכידת IP בכלל |
| user_agent | **חסר** | אין לכידה |
| session_id | **חסר** | אין sessions כי אין auth |
| request_id / trace_id | **חסר** | לא ניתן לקשר למספר בקשה |
| hash / prev_hash | **חסר** | אין hash chain |
| signature | **חסר** | אין חתימה דיגיטלית |

---

## 2. מטריצת כיסוי (Audit Coverage Matrix)

בדיקה של כל `state-changing endpoint` מול קריאה ל-`audit()`:

| # | Endpoint | HTTP | שורה | קורא ל-`audit()`? | שורה של audit | פגיעה |
|---|---|---|---|---|---|---|
| 1 | `POST /api/suppliers` | POST | 149 | כן | 152 | — |
| 2 | `PATCH /api/suppliers/:id` | PATCH | 157 | כן (עם prev/next) | 161 | — |
| 3 | `POST /api/suppliers/:id/products` | POST | 166 | **לא** | — | **F-50-01 CRITICAL** |
| 4 | `POST /api/purchase-requests` | POST | 192 | כן (ללא items) | 209 | F-50-02 PARTIAL |
| 5 | `POST /api/rfq/send` | POST | 226 | כן | 326 | — |
| 6 | `POST /api/quotes` | POST | 365 | כן | 412 | — |
| 7 | `POST /api/rfq/:id/decide` | POST | 425 | כן | 582 | — (אבל חסר PO.create) |
| 8 | `POST /api/purchase-orders/:id/approve` | POST | 614 | כן | 621 | — |
| 9 | `POST /api/purchase-orders/:id/send` | POST | 626 | כן | 672 | — |
| 10 | `POST /api/subcontractors` | POST | 691 | **לא** | — | **F-50-03 CRITICAL** |
| 11 | `PUT /api/subcontractors/:id/pricing` | PUT | 702 | **לא** | — | **F-50-04 CRITICAL** |
| 12 | `POST /api/subcontractors/decide` | POST | 712 | **לא** | — | **F-50-05 CRITICAL** |
| 13 | `POST /webhook/whatsapp` | POST | 876 | רק `system_events`, לא audit_log | 888 | F-50-06 MEDIUM |
| - | **אין DELETE endpoints כלל** | - | - | - | - | F-50-07 MEDIUM — אין מחיקה → טוב לעקבות, רע ל-GDPR |

### סיכום הכיסוי
- **9/13 endpoints מתועדים** = 69% coverage
- **4 endpoints קריטיים לא מתועדים בכלל** — כולל **כל מנגנון קבלני המשנה** (תתי קבלנים)
- **מוטציות עקיפות שנעשות בצד** לא מתועדות:
  - עדכון סטטוס `purchase_requests` לאחר RFQ (שורה 324) — לא ב-audit
  - עדכון סטטוס `rfq_recipients` ל-`quoted` (שורה 396-399) — לא ב-audit
  - עדכון מלא של `suppliers.total_orders/total_spent` לאחר החלטה (576-580) — **לא ב-audit** — קריטי לחישוב נתונים פיננסיים
  - עדכון `rfqs.status = 'decided'` (573) — לא ב-audit
  - יצירת `purchase_order` חדש בתוך decide (524) — רק ה-decision מתועדת, לא ה-PO

---

## 3. ממצאים מפורטים

### F-50-01 [CRITICAL] — `POST /api/suppliers/:id/products` ללא audit
שורה 166-170. הוספת מוצר חדש לספק (עם מחיר!) אינה נרשמת. תוקף יכול להוסיף מוצר במחיר מניפולטיבי מבלי להשאיר עקבות.

### F-50-02 [PARTIAL] — בקשת רכש רושמת רק ההיידר, לא items
שורה 192-211: רק ה-`purchase_request` נרשם, אבל `purchase_request_items` (שורה 206) אינם נכללים ב-`new_value`. ה-`detail` רק סופר כמה פריטים. לא ניתן לשחזר מה היה בבקשה.

### F-50-03 [CRITICAL] — יצירת קבלן משנה ללא audit
שורה 691-699. קבלן משנה חדש = התחייבות כספית/חוזית, ללא שום תיעוד ביקורת.

### F-50-04 [CRITICAL] — עדכון מחירון קבלני משנה ללא audit
שורה 702-709 — `upsert` של תעריפי קבלנים (`percentage_rate`, `price_per_sqm`, `minimum_price`). **זה המקום המסוכן ביותר:** שינוי מחיר בדיעבד מאפשר הונאה של מיליוני ש"ח ללא עקבות.

### F-50-05 [CRITICAL] — החלטת קבלן משנה ללא audit
שורה 712-798 — `subcontractor_decisions` נשמרת בטבלה שלה, אבל אין רשומת audit_log. בניגוד ל-`procurement_decisions` ב-RFQ (שורה 582), החלטת קבלן משנה אינה עוברת דרך `audit()`.

### F-50-06 [MEDIUM] — WhatsApp webhook ל-`system_events` בלבד
שורה 876-901. הודעות WhatsApp נכנסות נשמרות רק ב-`system_events`, שאינו המקור האמיתי ל-audit trail. ניתוח forensic של "מי ענה מה מתי" דורש לאחד את שני המקורות.

### F-50-07 [MEDIUM] — אין DELETE endpoints
מצד אחד: טוב ל-immutable logs. מצד שני:
- `ON DELETE CASCADE` בטבלאות `supplier_products`, `rfq_recipients`, `quote_line_items`, `po_line_items`, `subcontractor_pricing` — מחיקה של שורת אב תמחק רשומות ילד **ללא audit**.
- לא ניתן לבצע "זכות להישכח" GDPR/חוק הגנת הפרטיות הישראלי ללא עקיפת האפליקציה (SQL ישיר) — מה שבתורו עוקף את ה-audit.

### F-50-08 [CRITICAL] — שדה `actor` חסר אמינות — cross-ref B-03 (No Auth)
שורה 152: `req.body.created_by || 'api'`
שורה 161: `req.body.updated_by || 'api'`
שורה 209: `requestData.requested_by` — חופשי לחלוטין
שורה 538: `req.body.decided_by || 'system'`
שורה 582: `req.body.decided_by || 'AI'`
שורה 617: `req.body.approved_by` — אין ולידציה
שורה 672: `req.body.sent_by || 'api'`

**כל משתמש יכול לשים כל מחרוזת בשדה actor. אין אימות.** בהקשר משפטי (חוק החתימה האלקטרונית, פס"ד הונאה) — הלוג חסר ערך הוכחתי. כל ערך אפשר לזייף מ-Postman.

### F-50-09 [HIGH] — אין Tamper-Resistance (אין append-only, אין hash chain)
- הטבלה היא PostgreSQL רגיל — `UPDATE` ו-`DELETE` מותרים לכל מי שיש לו SERVICE_ROLE.
- אין `prev_hash`/`row_hash` → לא ניתן לזהות שנרשמה או שונתה שורה.
- אין חתימה של המערכת (HMAC/signature).
- `SUPABASE_SERVICE_ROLE` (שורה 16 של server.js) עוקף RLS — מי שיש לו מפתח יכול לעדכן את `audit_log` ישירות.

**המלצה:** להפוך את `audit_log` ל-APPEND-ONLY ברמת RLS + לשמור `row_hash = sha256(prev_hash || row_json)`.

### F-50-10 [HIGH] — אין מדיניות שמירה (Retention Policy) — cross-ref Agent 18
- אין CRON / `pg_cron` שמוחק שורות ישנות.
- אין הגדרה של משך זמן השמירה.
- **חוק החשבונאות (תקנות) דורש 7 שנים**. ללא מדיניות פעילה → אפשר שהנתונים יאבדו (אם אין backup retention בפרויקט Supabase החינמי — בד"כ 7 ימי PITR בלבד בתוכנית Pro).
- **Cross-ref Agent 18:** יש לוודא שפעולת גיבוי שומרת `audit_log` לכל הפחות 7 שנים במקום ארכיון קר (S3/Glacier).

### F-50-11 [CRITICAL] — דליפת PII ב-`previous_value`/`new_value` JSONB
`PATCH /api/suppliers/:id` (שורה 161) רושם את ה-supplier המלא לפני ואחרי. טבלת `suppliers` מכילה: `contact_person`, `phone`, `email`, `whatsapp`, `address` — **PII מלא**.

כאשר מוסיפים API endpoint לבדיקת audit (`GET /api/audit`, שורה 852) **ללא שום פילטר** — כל קורא יכול לראות את המספרים הפרטיים, האימיילים והכתובות של כל הספקים. זה **חוק הגנת הפרטיות 1981, סעיף 7** הפרה ישירה.

**המלצה:** לבצע redaction על שדות רגישים ב-JSONB לפני insert, או לשמור רק fingerprint (hash) של הערך.

### F-50-12 [MEDIUM] — אין UX לחיפוש / סינון
`GET /api/audit` (שורה 852-856) רק מחזיר `limit=50` ואת כל הטבלה. אין:
- סינון לפי `entity_type` / `actor` / טווח תאריכים / `action`
- חיפוש טקסטואלי על `detail`
- Pagination מעבר ל-limit
- Export ל-CSV/JSON לבקשה משפטית

לצורך חקירה משפטית, איש חקירה לא יכול לבודד שורות רלוונטיות.

### F-50-13 [MEDIUM] — אין זיהוי פערים בזמן (Gap Detection)
אין מנגנון שמזהה פער בסדרת `created_at` (למשל: אין שורות במשך שעה → חיווי על הפלה של השירות או מחיקה). ב-Forensics זה קריטי לדעת "האם המערכת הייתה למעלה".

**המלצה:** heartbeat כל 5 דק' ל-`system_events` ובדיקה שאין חור.

### F-50-14 [LOW] — רזולוציית זמן ms היא טובה, אבל ללא סנכרון NTP
`TIMESTAMPTZ DEFAULT NOW()` — דיוק מיקרו-שניות ב-Postgres. עם זאת, ללא דרישה שהשרת יהיה מסונכרן ל-NTP (חוק המענה הלאומי לחסר יציבות זמנים). לא קריטי אבל ראוי לתיעוד.

### F-50-15 [HIGH] — אין ייצוא Forensic / דוח לרשות אכיפה
אין endpoint להצגת דו"ח מלא של פעילות על entity מסוים (supplier/PO/rfq) שניתן לייצא כ-PDF חתום. דרישה סטנדרטית ברבעון שמגיעה בקשת בית משפט או רו"ח.

### F-50-16 [CRITICAL] — החלטות AI מתויגות כ-`AI` ב-actor
שורה 582: `req.body.decided_by || 'AI'` — כאשר ה-AI מקבל החלטה מי לבחור (כולל חיסכון כספי של עשרות אחוזים), הרשומה אומרת `actor='AI'`. אין:
- versioning של המודל שעשה את ההחלטה
- snapshot של ה-prompt / weights שהשפיעו
- יכולת לשחזר איך ה-AI הגיע למסקנה

**בהקשר של AI Act האירופי / חוק השקיפות האלגוריתמית**, החלטה אוטומטית ללא הסבר ניתנת לביטול משפטי. יש לשמור `decision_method`, `model_version`, `weights_snapshot` ב-audit.

---

## 4. ציות לחוק הישראלי — Compliance Matrix

| דרישה | מקור חוקי | סטטוס |
|---|---|---|
| שמירת ספרי חשבונות 7 שנים | חוק החשבונאות / פקודת מס הכנסה סעיף 130 | **FAIL** — אין מדיניות retention |
| רשומות תומכות לכל עסקה | תקנות מס הכנסה (ניהול פנקסי חשבונות) | PARTIAL — חסר audit למוצרי ספקים וקבלני משנה |
| תיעוד חתימה/אישור | חוק החתימה האלקטרונית 2001 | **FAIL** — שדה actor ניתן לזיוף |
| הגנה על PII | חוק הגנת הפרטיות 1981 | **FAIL** — JSONB מכיל PII נקי |
| גישה לרשומות רק למורשים | חוק הגנת הפרטיות סעיף 16 | **FAIL** — `GET /api/audit` פתוח |
| אי-ניתן לזיוף / לשינוי | תקנה 1(ב) של תקנות מס הכנסה (ניהול ממוחשב) | **FAIL** — אין tamper-resistance |
| יכולת שחזור לבקשה משפטית | סד"א + פקודת הראיות | FAIL — אין forensic export |

---

## 5. סיכום ממצאים

| חומרה | כמות | מזהים |
|---|---|---|
| CRITICAL | 7 | F-50-01, F-50-03, F-50-04, F-50-05, F-50-08, F-50-11, F-50-16 |
| HIGH | 3 | F-50-09, F-50-10, F-50-15 |
| MEDIUM | 4 | F-50-02, F-50-06, F-50-07, F-50-12, F-50-13 |
| LOW | 1 | F-50-14 |

**ציון audit trail כולל: 2/10** — הלוג קיים אך אינו עומד ברף של מערכת מוכנה לייצור, במיוחד בהקשר פיננסי ישראלי.

---

## 6. רשימת תיקונים מומלצת (סדר עדיפות)

1. **הוסף audit לכל 4 endpoints החסרים** (F-50-01, F-50-03, F-50-04, F-50-05) — 30 דקות עבודה
2. **הצפן/הסתר PII ב-JSONB** (F-50-11) — פונקציה שממירה `phone/email/address` ל-`[REDACTED]` או ל-hash
3. **הוסף authentication והשתמש ב-JWT claims לשדה actor** (F-50-08, cross-ref B-03)
4. **הפוך את `audit_log` ל-append-only** (F-50-09): `REVOKE UPDATE, DELETE ON audit_log FROM service_role` + טריגר שחוסם UPDATE
5. **הוסף hash chain**: `row_hash`, `prev_hash` column
6. **הוסף `pg_cron` + ארכיון S3 ל-7 שנים** (F-50-10)
7. **שפר את `GET /api/audit`**: פילטרים + CSV export + pagination (F-50-12, F-50-15)
8. **שמור versioning של AI decisions** (F-50-16)
9. **הוסף `ip_address`, `user_agent`, `request_id`** לטבלה
10. **צור view `audit_complete` שמאחד `audit_log` + `system_events`** לצפייה אחודה

---
**סוף דו"ח — Agent 50**
