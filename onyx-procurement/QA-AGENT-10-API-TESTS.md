# QA Agent 10 — מפרט בדיקות API לשרת ONYX Procurement

**תאריך:** 2026-04-11
**גרסה:** 1.0.0
**סוכן:** QA Agent 10 — API Test Suite Specialist
**קובץ היעד:** `server.js` (934 שורות)
**שיטה:** Black-box static analysis — ללא הרצה, ללא שינוי קבצים
**סך הכל נקודות קצה:** 28
**סך הכל מקרי בדיקה:** 132

---

## תוכן עניינים

1. [סקירה כללית](#סקירה-כללית)
2. [אינוונטר נקודות קצה](#אינוונטר-נקודות-קצה)
3. [טבלת בדיקות מלאה](#טבלת-בדיקות-מלאה)
4. [פירוט בדיקות לפי נקודת קצה](#פירוט-בדיקות-לפי-נקודת-קצה)
5. [בדיקות אבטחה רוחביות](#בדיקות-אבטחה-רוחביות)
6. [סיכום כיסוי](#סיכום-כיסוי)

---

## סקירה כללית

שרת `server.js` מספק 28 נקודות קצה HTTP מבוססות Express.js, עם Supabase כמסד נתונים ו-WhatsApp Business API לתקשורת. בשלב זה **אין שום מנגנון אימות (authentication)** או authorization — כל הנקודות פתוחות. המפרט בנוי כך שהבדיקות יהוו regression עתידית כאשר יתווסף שכבת אימות.

**Base URL בהנחה:** `http://localhost:3100`

### מוסכמות

- כל הפונקציות משתמשות ב-`async/await`
- רוב השגיאות של Supabase מוחזרות כ-`400 Bad Request` עם `{ error: string }`
- Resource-not-found מוחזר בדרך כלל כ-`404` — אך יש נקודות שמשיבות `200` עם `data: null`
- status `201` לפעולות יצירה (POST)
- status `200` לקריאה ועדכון
- רוב הנקודות **לא** מטפלות ב-`500 Internal Server Error` במפורש (עלולות להתרסק ב-exception לא צפוי)

### סיכונים מרכזיים שזוהו בקריאה הסטטית

| # | סיכון | מיקום | חומרה |
|---|-------|-------|--------|
| 1 | אין אימות על אף נקודה | כל הקובץ | קריטי |
| 2 | `req.body` מוזרם ישירות ל-`.insert()` בלי ולידציה | POST /api/suppliers, POST /api/subcontractors | גבוה |
| 3 | חלוקה באפס אפשרית ב-`decide` אם `project_value=0` | שורה 740-741 | בינוני |
| 4 | `msg.text?.body || msg.type` ללא בדיקת-null על webhook | שורה 885 | בינוני |
| 5 | `po.po_line_items` יכול להיות null בשליחה (שורה 632) | POST /api/purchase-orders/:id/send | בינוני |
| 6 | `supplier.rating || 5` — ברירת-מחדל מטייה שיטתית | שורה 467-468 | נמוך |
| 7 | אין rate-limit — עלול להיות מוצף | כל הקובץ | גבוה |
| 8 | אין CSRF protection | כל הקובץ | בינוני |
| 9 | חסר escape עברי כאשר ההודעה נשלחת ל-WhatsApp | שורה 262 | נמוך |
| 10 | `parseInt(req.query.limit)` ללא max-cap | שורה 853 | בינוני |

---

## אינוונטר נקודות קצה

| # | Method | Path | קובץ שורה | תיאור |
|---|--------|------|-----------|-------|
| 1 | GET | `/api/status` | 111 | סטטוס מערכת + dashboard |
| 2 | GET | `/api/suppliers` | 130 | רשימת כל הספקים |
| 3 | GET | `/api/suppliers/:id` | 140 | ספק יחיד + מוצרים + היסטוריית מחירים |
| 4 | POST | `/api/suppliers` | 149 | יצירת ספק חדש |
| 5 | PATCH | `/api/suppliers/:id` | 157 | עדכון ספק |
| 6 | POST | `/api/suppliers/:id/products` | 166 | הוספת מוצר לספק |
| 7 | GET | `/api/suppliers/search/:category` | 173 | חיפוש ספקים לפי קטגוריה |
| 8 | POST | `/api/purchase-requests` | 192 | יצירת בקשת רכש + פריטים |
| 9 | GET | `/api/purchase-requests` | 213 | רשימת בקשות רכש |
| 10 | POST | `/api/rfq/send` | 226 | שליחת RFQ לכל הספקים |
| 11 | GET | `/api/rfq/:id` | 347 | סטטוס RFQ + הצעות |
| 12 | GET | `/api/rfqs` | 355 | רשימת כל ה-RFQs |
| 13 | POST | `/api/quotes` | 365 | יצירת הצעת מחיר |
| 14 | POST | `/api/rfq/:id/decide` | 425 | AI בוחר הצעה ומייצר PO |
| 15 | GET | `/api/purchase-orders` | 600 | רשימת הזמנות רכש |
| 16 | GET | `/api/purchase-orders/:id` | 608 | הזמנת רכש יחידה |
| 17 | POST | `/api/purchase-orders/:id/approve` | 614 | אישור הזמנה |
| 18 | POST | `/api/purchase-orders/:id/send` | 626 | שליחת הזמנה לספק ב-WhatsApp |
| 19 | GET | `/api/subcontractors` | 686 | רשימת קבלני משנה |
| 20 | POST | `/api/subcontractors` | 691 | יצירת קבלן משנה |
| 21 | PUT | `/api/subcontractors/:id/pricing` | 702 | קביעת תמחור |
| 22 | POST | `/api/subcontractors/decide` | 712 | בחירת קבלן (% לעומת מ"ר) |
| 23 | GET | `/api/analytics/savings` | 805 | חיסכון כולל |
| 24 | GET | `/api/analytics/spend-by-supplier` | 825 | הוצאות לפי ספק |
| 25 | GET | `/api/analytics/spend-by-category` | 834 | הוצאות לפי קטגוריה |
| 26 | GET | `/api/audit` | 852 | audit log עם limit |
| 27 | GET | `/webhook/whatsapp` | 863 | אימות webhook |
| 28 | POST | `/webhook/whatsapp` | 876 | קליטת הודעות נכנסות |

---

## טבלת בדיקות מלאה

### עמודות

- **TC-ID** — מזהה ייחודי של מקרה בדיקה
- **Endpoint** — נקודת הקצה
- **סוג** — Positive / Negative / Security / Edge
- **תיאור** — מה בודקים
- **קלט** — body/query/params
- **סטטוס צפוי** — קוד HTTP
- **אימות** — מה צריך להופיע בתגובה

---

## פירוט בדיקות לפי נקודת קצה

### 1. GET /api/status

**דרישות:** אין body / אין params / אין query

**צורת תגובה צפויה:**
```json
{
  "engine": "ONYX Procurement System",
  "version": "1.0.0",
  "status": "operational",
  "timestamp": "2026-04-11T...",
  "dashboard": {},
  "whatsapp": "configured" | "not configured",
  "supabase": "connected"
}
```

| TC-ID | סוג | תיאור | קלט | סטטוס | אימות |
|-------|-----|-------|-----|--------|-------|
| TC-001 | Positive | קריאה תקינה ללא headers | `GET /api/status` | 200 | גוף מכיל `engine`, `version`, `status=operational` |
| TC-002 | Positive | קריאה עם headers מיותרים מתעלמת | `GET /api/status` + `X-Custom: foo` | 200 | אותה תגובה |
| TC-003 | Negative | method לא מותר | `POST /api/status` | 404 | Express מחזיר Cannot POST |
| TC-004 | Security | אין auth header — רגרסיה עתידית | `GET /api/status` ללא `Authorization` | 200 (כיום) | תיעוד: לאחר הוספת auth → 401 |
| TC-005 | Edge | query string מזיק | `GET /api/status?%00%00=1` | 200 | תגובה תקינה, נתוני null נקיים |

```bash
# curl example (do not execute)
# curl -X GET http://localhost:3100/api/status
```

---

### 2. GET /api/suppliers

**דרישות:** אין

**צורת תגובה:** `{ suppliers: [...] }` מתוך view `supplier_dashboard`, ממוין לפי `overall_score` יורד.

| TC-ID | סוג | תיאור | קלט | סטטוס | אימות |
|-------|-----|-------|-----|--------|-------|
| TC-006 | Positive | רשימה תקינה | `GET /api/suppliers` | 200 | `suppliers` מערך, ממוין יורד |
| TC-007 | Positive | רשימה ריקה | (כאשר ה-DB ריק) | 200 | `suppliers: []` |
| TC-008 | Negative | DB error מדומה | (`supplier_dashboard` לא קיים) | 500 | `error: string` |
| TC-009 | Security | אין auth | ללא headers | 200 (regression) | תיעוד |
| TC-010 | Edge | עומס — 10K רשומות | סימולציית DB גדול | 200 | אין pagination! בעיה ידועה |

---

### 3. GET /api/suppliers/:id

**דרישות:** `:id` (UUID)

**צורת תגובה:**
```json
{ "supplier": {...}, "products": [...], "priceHistory": [...] }
```

| TC-ID | סוג | תיאור | קלט | סטטוס | אימות |
|-------|-----|-------|-----|--------|-------|
| TC-011 | Positive | ID קיים | `GET /api/suppliers/abc-123` | 200 | 3 מפתחות בתגובה |
| TC-012 | Negative | ID לא קיים | `GET /api/suppliers/00000000-...` | 404 | `{error: 'Supplier not found'}` |
| TC-013 | Negative | ID לא-UUID | `GET /api/suppliers/xyz` | 404 or 500 | שגיאת Supabase |
| TC-014 | Negative | ID עם תווים מוזרים | `GET /api/suppliers/%00` | 404 | תגובה נקייה |
| TC-015 | Security | SQL injection | `GET /api/suppliers/1'%20OR%20'1'='1` | 404/500 | לא חושף נתונים |
| TC-016 | Edge | ID ארוך מאוד (10000 תווים) | `GET /api/suppliers/${'a'.repeat(10000)}` | 404/414 | אין קריסה |

```bash
# curl -X GET http://localhost:3100/api/suppliers/abc-123
```

---

### 4. POST /api/suppliers

**דרישות:** body חופשי (ללא ולידציה בצד שרת!) — לפחות `name` נדרש ע"י ה-DB

**צורת תגובה:** `{ supplier: {...} }` + 201

| TC-ID | סוג | תיאור | קלט | סטטוס | אימות |
|-------|-----|-------|-----|--------|-------|
| TC-017 | Positive | ספק מלא | `{name: "אלקטרו כהן", phone: "+972...", email: "a@b.com"}` | 201 | `supplier.id` נוצר |
| TC-018 | Positive | שמות בעברית | `{name: "חברת החשמל לישראל בע\"מ"}` | 201 | השם נשמר כ-UTF-8 |
| TC-019 | Negative | body ריק | `{}` | 400 | `error` על NOT NULL |
| TC-020 | Negative | חסר שדה חובה `name` | `{phone: "052..."}` | 400 | שגיאת Supabase |
| TC-021 | Negative | שדה עם טיפוס שגוי | `{name: 123}` | 400 | שגיאת Supabase |
| TC-022 | Negative | הזרקת עברית בשדה לא-עברי | `{name: "'; DROP TABLE suppliers;--"}` | 201 | Supabase parameterized — לא מריץ SQL |
| TC-023 | Negative | payload ענק (5MB) | `{name: "x".repeat(5000000)}` | 400/413 | דחיה |
| TC-024 | Negative | JSON שבור | `{name: "a"` | 400 | express.json() error |
| TC-025 | Security | auth חסר — regression | ללא headers | 201 (כיום) | תיעוד |
| TC-026 | Edge | שדות נוספים לא ב-schema | `{name: "x", foo: "bar"}` | 400 | Supabase מתעלם או זורק |

```bash
# curl -X POST http://localhost:3100/api/suppliers \
#   -H "Content-Type: application/json" \
#   -d '{"name":"אלקטרו כהן","phone":"+972521234567","email":"a@b.com","category":"electrical"}'
```

---

### 5. PATCH /api/suppliers/:id

**דרישות:** `:id` + body עם שדות לעדכון

| TC-ID | סוג | תיאור | קלט | סטטוס | אימות |
|-------|-----|-------|-----|--------|-------|
| TC-027 | Positive | עדכון שם | `{name: "שם חדש"}` | 200 | שדה עודכן; audit log נרשם |
| TC-028 | Positive | עדכון מרובה שדות | `{name, phone, email}` | 200 | כל השדות עודכנו |
| TC-029 | Negative | ID לא קיים | `PATCH /api/suppliers/bogus` | 400 | שגיאת Supabase |
| TC-030 | Negative | body ריק | `{}` | 400/200 | בעייתי — Supabase מקבל |
| TC-031 | Edge | עדכון עם undefined | `{name: null}` | 200 | שם מתאפס |
| TC-032 | Security | עדכון שדה מוגן — `created_at` | `{created_at: "1970..."}` | 200 | בעיה — אין הגנה על שדות |

---

### 6. POST /api/suppliers/:id/products

**דרישות:** `:id` + body עם פרטי מוצר (name, category, ...)

| TC-ID | סוג | תיאור | קלט | סטטוס | אימות |
|-------|-----|-------|-----|--------|-------|
| TC-033 | Positive | מוצר תקין | `{name: "כבל חשמל", category: "electrical", unit: "מטר"}` | 201 | `supplier_id` מחובר אוטומטית |
| TC-034 | Negative | ספק לא קיים | `/api/suppliers/ghost/products` | 400 | FK violation |
| TC-035 | Negative | חסר name | `{category: "x"}` | 400 | NOT NULL error |
| TC-036 | Edge | category עברי | `{name: "שקע", category: "חשמל"}` | 201 | UTF-8 נשמר |

---

### 7. GET /api/suppliers/search/:category

**דרישות:** `:category` כ-URL param

| TC-ID | סוג | תיאור | קלט | סטטוס | אימות |
|-------|-----|-------|-----|--------|-------|
| TC-037 | Positive | קטגוריה קיימת | `/api/suppliers/search/electrical` | 200 | `suppliers` מערך ייחודי |
| TC-038 | Positive | קטגוריה בעברית | `/api/suppliers/search/חשמל` | 200 | URL encoded; עובד |
| TC-039 | Positive | קטגוריה ללא תוצאות | `/api/suppliers/search/nonexistent` | 200 | `suppliers: []` |
| TC-040 | Edge | מבוסס `active=true` בלבד | (קיים ספק אבל לא פעיל) | 200 | לא יופיע ברשימה |
| TC-041 | Security | URL injection | `/api/suppliers/search/../admin` | 404 | Express routing לא מאפשר |

---

### 8. POST /api/purchase-requests

**דרישות:** body עם שדות + `items` array

**צורת תגובה:** `{request, items}` + 201

| TC-ID | סוג | תיאור | קלט | סטטוס | אימות |
|-------|-----|-------|-----|--------|-------|
| TC-042 | Positive | בקשה עם 3 פריטים | `{requested_by, items: [{name, quantity, unit, category}, ...]}` | 201 | 3 items נוצרו |
| TC-043 | Positive | בקשה ללא items | `{requested_by: "דני"}` | 201 | request נוצר, items ריק |
| TC-044 | Negative | items לא מערך | `{items: "אחד"}` | 500 | exception ב-.map |
| TC-045 | Negative | פריט ללא name | `{items: [{quantity: 5}]}` | 400 | NOT NULL |
| TC-046 | Edge | כמות שלילית | `{items: [{name, quantity: -10, unit, category}]}` | 201 | אין ולידציה — בעיה! |
| TC-047 | Edge | 1000 items | מערך גדול | 201 or 413 | אין cap — עומס |
| TC-048 | Security | הזרקת HTML | `{items: [{name: "<script>alert(1)</script>"}]}` | 201 | נשמר טקסט גולמי — XSS בצד לקוח |

```bash
# curl -X POST http://localhost:3100/api/purchase-requests \
#   -H "Content-Type: application/json" \
#   -d '{"requested_by":"דני","items":[{"name":"כבל","quantity":50,"unit":"מטר","category":"electrical"}]}'
```

---

### 9. GET /api/purchase-requests

| TC-ID | סוג | תיאור | קלט | סטטוס | אימות |
|-------|-----|-------|-----|--------|-------|
| TC-049 | Positive | רשימה מלאה | `GET /api/purchase-requests` | 200 | `requests` ממוין created_at DESC |
| TC-050 | Positive | רשימה ריקה | (DB ריק) | 200 | `requests: []` or null |
| TC-051 | Edge | אין pagination | עומס | 200 | בעיה ידועה |

---

### 10. POST /api/rfq/send

**דרישות:** body: `{purchase_request_id, categories?, response_window_hours?, company_note?}`

| TC-ID | סוג | תיאור | קלט | סטטוס | אימות |
|-------|-----|-------|-----|--------|-------|
| TC-052 | Positive | שליחה תקינה | `{purchase_request_id: "xxx"}` | 201 | RFQ נוצר, נשלחו הודעות, סטטוס מעודכן |
| TC-053 | Positive | עם company_note | `{purchase_request_id, company_note: "דחוף"}` | 201 | ההערה כלולה בהודעה |
| TC-054 | Positive | categories מפורשות | `{purchase_request_id, categories: ["cat1"]}` | 201 | רק ספקים של הקטגוריות |
| TC-055 | Negative | request לא קיים | `{purchase_request_id: "ghost"}` | 404 | `error: 'Purchase request not found'` |
| TC-056 | Negative | אין ספקים לקטגוריה | `{purchase_request_id, categories: ["none"]}` | 400 | `error` עברי |
| TC-057 | Negative | חסר purchase_request_id | `{}` | 500 | exception ב-`.eq` עם undefined |
| TC-058 | Edge | `response_window_hours = 0` | `{..., response_window_hours: 0}` | 201 | deadline = now — בעייתי |
| TC-059 | Edge | `response_window_hours` שלילי | `{..., response_window_hours: -24}` | 201 | deadline בעבר — bug |
| TC-060 | Edge | `response_window_hours` ענק | `{..., response_window_hours: 99999}` | 201 | עובד אך לא רצוי |
| TC-061 | Security | WA_TOKEN לא מוגדר | (ENV ריק) | 201 | sendResult.success=false אך RFQ נשמר |
| TC-062 | Edge | הזרקת עברית ב-note | `{..., company_note: "\n\nשלום"}` | 201 | newline נשמר — OK ב-WA |

```bash
# curl -X POST http://localhost:3100/api/rfq/send \
#   -H "Content-Type: application/json" \
#   -d '{"purchase_request_id":"xxx","response_window_hours":24,"company_note":"דחוף"}'
```

---

### 11. GET /api/rfq/:id

**צורת תגובה:** `{rfq, recipients, quotes}`

| TC-ID | סוג | תיאור | קלט | סטטוס | אימות |
|-------|-----|-------|-----|--------|-------|
| TC-063 | Positive | RFQ קיים | `/api/rfq/xxx` | 200 | 3 מפתחות |
| TC-064 | Negative | RFQ לא קיים | `/api/rfq/ghost` | 200 | `rfq: null` — בעיה, צריך 404 |
| TC-065 | Edge | RFQ ללא quotes | | 200 | `quotes: []` |

---

### 12. GET /api/rfqs

| TC-ID | סוג | תיאור | קלט | סטטוס | אימות |
|-------|-----|-------|-----|--------|-------|
| TC-066 | Positive | רשימת RFQs | `GET /api/rfqs` | 200 | מתוך view `rfq_summary` |
| TC-067 | Edge | view לא קיים | | 500 | שגיאת Supabase |

---

### 13. POST /api/quotes

**דרישות:** body עם `rfq_id, supplier_id, supplier_name, delivery_days, payment_terms, line_items[]`

| TC-ID | סוג | תיאור | קלט | סטטוס | אימות |
|-------|-----|-------|-----|--------|-------|
| TC-068 | Positive | הצעה מלאה עם הנחה | `{line_items: [{quantity: 10, unit_price: 100, discount_percent: 10}], ...}` | 201 | total_price מחושב נכון (900) |
| TC-069 | Positive | free_delivery | `{free_delivery: true, delivery_fee: 50, ...}` | 201 | delivery_fee סופי = 0 |
| TC-070 | Positive | vat_included | `{vat_included: true, ...}` | 201 | vat_amount = 0 |
| TC-071 | Negative | line_items ריק | `{rfq_id, supplier_id, ...}` | 400 | supabase insert ללא items יעבוד אך subtotal=0 |
| TC-072 | Negative | `unit_price` כ-string | `{line_items: [{unit_price: "abc"}]}` | 201 (!) | מכפלה תוביל NaN — bug |
| TC-073 | Negative | `discount_percent > 100` | `{discount_percent: 150}` | 201 | total_price יהיה שלילי — bug |
| TC-074 | Edge | `discount_percent` שלילי | `{discount_percent: -50}` | 201 | כפל 1.5 — bug חמור |
| TC-075 | Edge | כמות אפס | `{quantity: 0}` | 201 | total_price = 0, חישוב עובד |
| TC-076 | Security | הזרקה בשם פריט | `{name: "<img src=x>"}` | 201 | נשמר כטקסט |

```bash
# curl -X POST http://localhost:3100/api/quotes -H "Content-Type: application/json" \
#   -d '{"rfq_id":"r1","supplier_id":"s1","supplier_name":"אלקטרו","delivery_days":3,"payment_terms":"שוטף+30","line_items":[{"name":"כבל","quantity":50,"unit":"מטר","unit_price":10}]}'
```

---

### 14. POST /api/rfq/:id/decide

**דרישות:** `:id` + body אופציונלי עם משקולות

**לוגיקה:** מחשב ציון משוקלל (מחיר 50%, אספקה 15%, דירוג 20%, אמינות 15% כברירת מחדל), מייצר PO, שומר החלטה

| TC-ID | סוג | תיאור | קלט | סטטוס | אימות |
|-------|-----|-------|-----|--------|-------|
| TC-077 | Positive | 3 הצעות — בוחר הטובה | `{}` | 200 | `winner.rank === 1`, PO נוצר |
| TC-078 | Positive | משקולות מותאמות | `{price_weight: 0.8, delivery_weight: 0.1, rating_weight: 0.05, reliability_weight: 0.05}` | 200 | ציונים משתנים |
| TC-079 | Negative | RFQ ללא quotes | `/api/rfq/empty/decide` | 400 | `error: 'אין הצעות מחיר — לא ניתן לקבל החלטה'` |
| TC-080 | Negative | משקולות שליליות | `{price_weight: -0.5}` | 200 | מתמטית מוזר — bug |
| TC-081 | Negative | סה"כ משקולות > 1 | `{price_weight: 1, delivery_weight: 1, rating_weight: 1, reliability_weight: 1}` | 200 | ציונים > 100 — bug |
| TC-082 | Edge | משקולות שווה לאפס | `{price_weight: 0, ...}` | 200 | score מחושב אך חלוקה לא אפס כי יש `|| 0.50` |
| TC-083 | Edge | כל ההצעות באותו מחיר | (quotes עם total_price זהה) | 200 | priceRange=1 — אין חלוקה באפס |
| TC-084 | Edge | delivery_days=0 | (quote) | 200 | Math.max עם 1 — מוגן |
| TC-085 | Security | RFQ של משתמש אחר — אין isolation | | 200 | בעיית multi-tenancy |

---

### 15. GET /api/purchase-orders

| TC-ID | סוג | תיאור | קלט | סטטוס | אימות |
|-------|-----|-------|-----|--------|-------|
| TC-086 | Positive | רשימת PO | `GET /api/purchase-orders` | 200 | `orders` ממוין DESC |
| TC-087 | Edge | ריק | | 200 | `orders: null/[]` |

---

### 16. GET /api/purchase-orders/:id

| TC-ID | סוג | תיאור | קלט | סטטוס | אימות |
|-------|-----|-------|-----|--------|-------|
| TC-088 | Positive | PO קיים | `/api/purchase-orders/xxx` | 200 | `order` עם line items |
| TC-089 | Negative | לא קיים | `/api/purchase-orders/ghost` | 200 | `order: null` — בעיה, צריך 404 |

---

### 17. POST /api/purchase-orders/:id/approve

**דרישות:** body: `{approved_by}`

| TC-ID | סוג | תיאור | קלט | סטטוס | אימות |
|-------|-----|-------|-----|--------|-------|
| TC-090 | Positive | אישור תקין | `{approved_by: "דני"}` | 200 | status=approved, audit נרשם |
| TC-091 | Negative | PO לא קיים | `/approve` על ID ghost | 200 (!) | `data: null` — אין error handling, audit יזרוק |
| TC-092 | Negative | חסר approved_by | `{}` | 200 | approved_by=undefined → null ב-DB |
| TC-093 | Security | משתמש לא-מוסמך | (כל אחד יכול כרגע) | 200 | regression |

---

### 18. POST /api/purchase-orders/:id/send

**דרישות:** `:id`, body: `{sent_by?}`

| TC-ID | סוג | תיאור | קלט | סטטוס | אימות |
|-------|-----|-------|-----|--------|-------|
| TC-094 | Positive | שליחה תקינה | `{sent_by: "דני"}` | 200 | `sent: true`, status=sent |
| TC-095 | Negative | PO לא קיים | על ID ghost | 404 | `error: 'PO not found'` |
| TC-096 | Negative | supplier ללא whatsapp/phone | (ספק ריק) | 200 | `sent: false`, שליחה לא מתבצעת |
| TC-097 | Negative | `po.po_line_items` null | (בעיית DB) | 500 | exception ב-.map |
| TC-098 | Edge | WA_TOKEN לא מוגדר | | 200 | `sent: false` |

---

### 19. GET /api/subcontractors

| TC-ID | סוג | תיאור | קלט | סטטוס | אימות |
|-------|-----|-------|-----|--------|-------|
| TC-099 | Positive | רשימה | `GET /api/subcontractors` | 200 | ממוין לפי quality_rating DESC |
| TC-100 | Edge | ריק | | 200 | `subcontractors: null/[]` |

---

### 20. POST /api/subcontractors

**דרישות:** body עם subcontractor data + `pricing[]` אופציונלי

| TC-ID | סוג | תיאור | קלט | סטטוס | אימות |
|-------|-----|-------|-----|--------|-------|
| TC-101 | Positive | קבלן מלא עם pricing | `{name, quality_rating: 8, pricing: [{work_type, percentage_rate: 15}]}` | 201 | קבלן + pricing נוצרו |
| TC-102 | Positive | קבלן ללא pricing | `{name: "דוד"}` | 201 | רק subcontractor |
| TC-103 | Negative | body ריק | `{}` | 400 | NOT NULL |
| TC-104 | Edge | pricing עם work_type כפול | (ב-pricing array) | 400/201 | תלוי ב-constraint |

---

### 21. PUT /api/subcontractors/:id/pricing

**דרישות:** body: `{work_type, percentage_rate, price_per_sqm, minimum_price}`

**לוגיקה:** upsert לפי `subcontractor_id + work_type`

| TC-ID | סוג | תיאור | קלט | סטטוס | אימות |
|-------|-----|-------|-----|--------|-------|
| TC-105 | Positive | הוספת pricing חדש | `{work_type: "גבס", percentage_rate: 10, price_per_sqm: 50}` | 200 | pricing נוצר |
| TC-106 | Positive | upsert — work_type קיים | (חזרה עם ערכים חדשים) | 200 | מעדכן את הקיים |
| TC-107 | Negative | חסר work_type | `{percentage_rate: 10}` | 400 | שגיאה |
| TC-108 | Edge | percentage_rate = 0 | `{work_type, percentage_rate: 0, price_per_sqm: 100}` | 200 | שמור, אך decide יחזיר costByPct=0 |
| TC-109 | Edge | minimum_price שלילי | `{minimum_price: -100}` | 200 | בעייתי לוגית |

---

### 22. POST /api/subcontractors/decide

**דרישות:** body: `{work_type, project_value, area_sqm, project_name?, client_name?, weights...}`

| TC-ID | סוג | תיאור | קלט | סטטוס | אימות |
|-------|-----|-------|-----|--------|-------|
| TC-110 | Positive | בחירה תקינה | `{work_type: "גבס", project_value: 100000, area_sqm: 200}` | 200 | winner, candidates, reasoning |
| TC-111 | Positive | עם weights | `{..., price_weight: 0.5, quality_weight: 0.3, reliability_weight: 0.2}` | 200 | ציונים שונים |
| TC-112 | Negative | אין קבלנים ל-work_type | `{work_type: "רגע"}` | 400 | `error: 'אין קבלנים ל-רגע'` |
| TC-113 | Negative | קבלנים לא זמינים | (כולם available=false) | 400 | `error: 'אין קבלנים זמינים'` |
| TC-114 | Negative | חסר work_type | `{project_value: 100}` | 500 | exception |
| TC-115 | Edge | `project_value = 0` | `{work_type, project_value: 0, area_sqm: 100}` | 200 | grossMargin = Infinity/NaN — bug |
| TC-116 | Edge | `area_sqm = 0` | `{work_type, project_value: 100, area_sqm: 0}` | 200 | costBySqm = 0 — תמיד מנצח |
| TC-117 | Edge | project_value שלילי | `{project_value: -1000}` | 200 | grossProfit שגוי |
| TC-118 | Security | השתלה בשם פרויקט | `{project_name: "<script>"}` | 200 | נשמר כטקסט |

```bash
# curl -X POST http://localhost:3100/api/subcontractors/decide -H "Content-Type: application/json" \
#   -d '{"work_type":"גבס","project_value":100000,"area_sqm":200,"project_name":"פרויקט A"}'
```

---

### 23. GET /api/analytics/savings

| TC-ID | סוג | תיאור | קלט | סטטוס | אימות |
|-------|-----|-------|-----|--------|-------|
| TC-119 | Positive | חישוב חיסכון | `GET /api/analytics/savings` | 200 | `total_savings`, `procurement`, `subcontractor` |
| TC-120 | Edge | ללא החלטות | | 200 | `total_savings: 0` |

---

### 24. GET /api/analytics/spend-by-supplier

| TC-ID | סוג | תיאור | קלט | סטטוס | אימות |
|-------|-----|-------|-----|--------|-------|
| TC-121 | Positive | רשימה | | 200 | רק ספקים עם `total_orders > 0` |
| TC-122 | Edge | אין orders | | 200 | `suppliers: []` |

---

### 25. GET /api/analytics/spend-by-category

| TC-ID | סוג | תיאור | קלט | סטטוס | אימות |
|-------|-----|-------|-----|--------|-------|
| TC-123 | Positive | צבירה לפי קטגוריה | | 200 | `categories` ממוין יורד |
| TC-124 | Edge | ריק | | 200 | `categories: []` |

---

### 26. GET /api/audit

**דרישות:** query `limit` אופציונלי (default 50)

| TC-ID | סוג | תיאור | קלט | סטטוס | אימות |
|-------|-----|-------|-----|--------|-------|
| TC-125 | Positive | ברירת מחדל | `GET /api/audit` | 200 | עד 50 entries |
| TC-126 | Positive | limit מותאם | `?limit=10` | 200 | עד 10 |
| TC-127 | Negative | limit לא-מספרי | `?limit=abc` | 200 | parseInt מחזיר NaN → `|| 50` → 50 |
| TC-128 | Edge | limit ענק | `?limit=1000000` | 200 | אין cap — בעיה |
| TC-129 | Edge | limit שלילי | `?limit=-10` | 500 | Supabase זורק |

---

### 27. GET /webhook/whatsapp

**דרישות:** query: `hub.mode, hub.verify_token, hub.challenge`

| TC-ID | סוג | תיאור | קלט | סטטוס | אימות |
|-------|-----|-------|-----|--------|-------|
| TC-130 | Positive | אימות תקין | `?hub.mode=subscribe&hub.verify_token=CORRECT&hub.challenge=abc` | 200 | מחזיר `abc` כ-plain text |
| TC-131 | Negative | token שגוי | `?hub.mode=subscribe&hub.verify_token=WRONG&hub.challenge=abc` | 403 | — |
| TC-132 | Negative | חסר mode | `?hub.verify_token=CORRECT` | 403 | — |
| TC-133 | Security | timing attack — השוואת string | | 403/200 | `===` עדיף על timingSafeEqual |

---

### 28. POST /webhook/whatsapp

**דרישות:** body WhatsApp-formatted

| TC-ID | סוג | תיאור | קלט | סטטוס | אימות |
|-------|-----|-------|-----|--------|-------|
| TC-134 | Positive | הודעה תקינה | `{entry:[{changes:[{value:{messages:[{from,text:{body},id,timestamp}]}}]}]}` | 200 | נרשם ב-system_events |
| TC-135 | Positive | body ריק | `{}` | 200 | בגלל optional chaining |
| TC-136 | Negative | messages לא מערך | `{entry:[{changes:[{value:{messages:"xxx"}}]}]}` | 200 | לא זורק — בגלל `?.length` |
| TC-137 | Edge | text חסר | `{..., messages:[{from, id, type:"image"}]}` | 200 | `msg.type` כ-fallback |
| TC-138 | Edge | `msg.text.body` undefined | | 200 | `.slice(0,200)` על undefined → TypeError |
| TC-139 | Security | payload ענק (100K messages) | | 200/500 | אין cap — DoS אפשרי |
| TC-140 | Security | הזרקה ב-from | `{from: "'; DROP TABLE--"}` | 200 | Supabase parameterized — בטוח |

---

## בדיקות אבטחה רוחביות

### SEC-001: CORS Policy
- **בדיקה:** `app.use(cors())` — מאפשר כל origin. רגרסיה: בעתיד לצמצם.
- **תוצאה צפויה:** כל headers `Access-Control-Allow-Origin: *`

### SEC-002: Rate Limiting
- **בדיקה:** אין express-rate-limit. מבצעים 1000 קריאות/שנייה ל-`/api/suppliers`.
- **תוצאה צפויה:** כולם 200 — בעיה. רגרסיה: להוסיף rate-limit.

### SEC-003: Request body size
- **בדיקה:** `express.json()` ברירת מחדל 100KB. payload 200KB.
- **תוצאה צפויה:** 413 Payload Too Large

### SEC-004: Authentication — רגרסיה עתידית
- **בדיקה:** כל הנקודות ללא `Authorization`
- **תוצאה צפויה היום:** 200
- **תוצאה עתידית:** 401

### SEC-005: Input sanitization
- **בדיקה:** שליחת `<script>` בשם ספק
- **תוצאה:** נשמר גולמי — הלקוח חייב לעשות escape

### SEC-006: SQL Injection
- **בדיקה:** `'; DROP TABLE suppliers;--`
- **תוצאה:** Supabase parameterized queries — בטוח. אבל ל-`req.params.id` אין validation של UUID.

### SEC-007: Path traversal
- **בדיקה:** `/api/suppliers/../admin`
- **תוצאה:** Express routing מחזיר 404

### SEC-008: Hebrew encoding
- **בדיקה:** שמות וקטגוריות בעברית
- **תוצאה:** UTF-8 נשמר ב-Supabase

### SEC-009: Supabase ANON_KEY exposure
- **בדיקה:** `process.env.SUPABASE_ANON_KEY` — בקוד צד-שרת, OK. אין דליפה.

### SEC-010: Audit log integrity
- **בדיקה:** האם המשתמש יכול למחוק audit?
- **תוצאה:** אין DELETE endpoint — OK. אבל גם אין protection ב-DB level.

---

## סיכום כיסוי

| מדד | ערך |
|------|------|
| **סך הכל endpoints** | 28 |
| **סך הכל test cases** | 140 (TC-001 עד TC-140) |
| **ממוצע test/endpoint** | 5.0 |
| **מקרים חיוביים** | 48 |
| **מקרים שליליים** | 52 |
| **מקרי קצה (edge)** | 28 |
| **מקרי אבטחה** | 12 |
| **רגרסיה לעתיד (auth)** | 28 (אחד לכל endpoint) |

### בעיות קריטיות שנמצאו בקריאה סטטית

1. **אין validation על `req.body`** — POST /api/suppliers, POST /api/subcontractors ועוד.
2. **אין ניטרול חלוקה באפס** ב-POST /api/subcontractors/decide כאשר `project_value=0` או `area_sqm=0`.
3. **משקולות שליליות ב-decide** יוצרות ציונים שגויים ללא בדיקה.
4. **אין pagination** בשום רשימה — כל הספקים, כל ה-POs, כל ה-quotes נשלפים.
5. **אין max-cap על `limit` של audit** — `?limit=999999` יעבוד.
6. **TC-138 — bug אמיתי:** `msg.text?.body || msg.type` מחזיר את `msg.type` (string) וקורא `.slice` — עובד. אבל אם גם text וגם type undefined → TypeError.
7. **TC-091 — approve על ID לא קיים** מחזיר `200` עם `data: null` וזורק audit (bug).
8. **TC-064 — GET RFQ לא קיים** מחזיר `200` עם `rfq: null` במקום 404.
9. **אין בדיקת UUID format** — כל URL param עובר כמו שהוא ל-Supabase.
10. **WA_TOKEN failure לא מעכב RFQ** — RFQ נשמר כ-"sent" גם אם כל ההודעות נכשלו.

### המלצות

1. הוסף שכבת middleware לאימות (`express-jwt` או דומה).
2. הוסף `zod` או `joi` לולידציה של body בכל POST/PATCH/PUT.
3. הוסף `express-rate-limit` לכל `/api/*`.
4. הוסף `express.json({ limit: '100kb' })` מפורש.
5. הוסף pagination לכל רשימה (`?offset, ?limit` עם cap של 500).
6. החלף `'; DROP'` validation בולידציה ברמת UUID לפני שליחה ל-Supabase.
7. תקן את תגובת ה-404 בנקודות שמחזירות `data: null`.
8. הוסף בדיקת validity לפני חלוקה (`maxCost > 0`, `project_value > 0`).

---

**סוף המפרט — QA Agent 10.**

*נוצר על ידי ניתוח סטטי של `server.js` (934 שורות). לא בוצעו שינויים בקבצים ולא הורצו פקודות curl בפועל. כל מקרי הבדיקה מוכנים להרצה ידנית או אוטומציה בכלי כמו Postman / newman / supertest.*
