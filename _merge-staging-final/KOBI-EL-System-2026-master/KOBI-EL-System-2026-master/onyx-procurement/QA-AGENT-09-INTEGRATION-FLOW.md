# QA Agent 9 — דוח ניתוח זרימת אינטגרציה

**מערכת:** ONYX Procurement
**מקור:** `server.js` (934 שורות) + `001-supabase-schema.sql` (562 שורות)
**סוג ניתוח:** סטטי בלבד — ללא הרצה, ללא שינויי קוד
**תאריך:** 2026-04-11

---

## 1. תרשים זרימה מלא (ASCII)

```
                                  ONYX PROCUREMENT — E2E FLOW
                                  ════════════════════════════

 [CLIENT]                                                                   [DB STATE]
    │
    │ 1. POST /api/purchase-requests
    │    body = { items: [...], requested_by, project_id, ... }
    ▼
 ┌────────────────────────────┐                                 ┌──────────────────────────┐
 │  insert purchase_requests  │────────────────────────────────▶│ purchase_requests        │
 │  insert purchase_request_  │                                 │   status='draft'         │
 │         items (bulk)       │                                 │ purchase_request_items   │
 │  audit('purchase_request') │                                 │   request_id=FK CASCADE  │
 └────────────────────────────┘                                 └──────────────────────────┘
    │  (no tx — PR insert OK but items insert fails => אורפן!)
    │
    │ 2. POST /api/rfq/send
    │    body = { purchase_request_id, categories, response_window_hours }
    ▼
 ┌──────────────────────────────────────┐                       ┌──────────────────────────┐
 │  SELECT purchase_requests + items    │                       │ rfqs                     │
 │  SELECT supplier_products IN (cats)  │                       │   status='sent'          │
 │  Build RFQ text                      │──────────────────────▶│ rfq_recipients           │
 │  insert rfqs (status='sent')         │                       │   per supplier           │
 │  LOOP suppliers:                     │                       │ purchase_requests        │
 │    sendWhatsApp / sendSMS (no await  │                       │   status='rfq_sent'      │
 │       retry/back-off)                │                       │ system_events            │
 │    insert rfq_recipients             │                       │ audit_log                │
 │  UPDATE purchase_requests.status     │                       └──────────────────────────┘
 │       = 'rfq_sent'                   │
 │  audit + system_events               │
 └──────────────────────────────────────┘
    │  (no tx — rfq קיים, חלק מה-recipients נשלחו, חלק לא)
    │
    │ 3. POST /api/quotes   (קריאה לכל הצעת מחיר נכנסת)
    │    body = { rfq_id, supplier_id, supplier_name, line_items, delivery_days, ... }
    ▼
 ┌──────────────────────────────────────┐                       ┌──────────────────────────┐
 │  חישוב totals (VAT, delivery)        │                       │ supplier_quotes          │
 │  insert supplier_quotes              │──────────────────────▶│   FK rfq_id → rfqs       │
 │  insert quote_line_items (bulk)      │                       │ quote_line_items         │
 │  UPDATE rfq_recipients               │                       │   FK quote_id CASCADE    │
 │       .status='quoted'               │                       │ rfq_recipients.status=   │
 │  insert price_history  (לכל שורה)   │                       │   'quoted'               │
 │  audit('quote')                      │                       │ price_history            │
 └──────────────────────────────────────┘                       └──────────────────────────┘
    │  (no tx — quote קיים אבל line_items נכשל => totals לא תקפים)
    │  קריאה חוזרת: עלולה ליצור כפילויות (אין unique(rfq_id,supplier_id))
    │
    │ 4. POST /api/rfq/:id/decide
    │    body = { price_weight, delivery_weight, rating_weight, reliability_weight }
    ▼
 ┌──────────────────────────────────────┐                       ┌──────────────────────────┐
 │  SELECT quotes + line_items          │                       │ purchase_orders          │
 │  SELECT suppliers IN (ids)           │                       │   status='draft'         │
 │  חישוב ציונים משוקללים               │                       │   source='rfq'           │
 │  בחירת זוכה                          │                       │ po_line_items            │
 │  insert purchase_orders (draft)      │──────────────────────▶│ procurement_decisions    │
 │  insert po_line_items (bulk)         │                       │ rfqs.status='decided'    │
 │  insert procurement_decisions        │                       │ suppliers.total_orders++ │
 │  UPDATE rfqs.status='decided'        │                       │ audit_log                │
 │  UPDATE suppliers (total_orders,     │                       └──────────────────────────┘
 │       total_spent, last_order_date)  │
 │  audit('procurement_decision')       │
 └──────────────────────────────────────┘
    │  (no tx — PO קיים בלי line_items,
    │   או decision בלי PO, או suppliers סטטיסטיקה משוחקת)
    │  ללא ולידציה שבקשת הרכש עדיין רלוונטית (אפשר decide פעמיים!)
    │
    │ 5. POST /api/purchase-orders/:id/approve
    │    body = { approved_by }
    ▼
 ┌──────────────────────────────────────┐                       ┌──────────────────────────┐
 │  UPDATE purchase_orders              │                       │ purchase_orders          │
 │    SET status='approved'             │──────────────────────▶│   status='approved'      │
 │        approved_by, approved_at      │                       │   approved_at=NOW()      │
 │  audit('approved')                   │                       │ audit_log                │
 └──────────────────────────────────────┘
    │  (אין בדיקה שה-status הקודם = 'draft'/'pending_approval')
    │  (אין בדיקה שכבר לא אושר / נשלח / בוטל)
    │
    │ 6. POST /api/purchase-orders/:id/send
    │    body = { sent_by }
    ▼
 ┌──────────────────────────────────────┐                       ┌──────────────────────────┐
 │  SELECT po + po_line_items           │                       │ purchase_orders          │
 │  SELECT supplier                     │                       │   status='sent'          │
 │  Build PO text                       │                       │   sent_at=NOW()          │
 │  sendWhatsApp(...)  (ללא await      │──────────────────────▶│ audit_log                │
 │    for success before update)        │                       └──────────────────────────┘
 │  UPDATE purchase_orders              │
 │    SET status='sent', sent_at        │
 │  audit('sent')                       │
 └──────────────────────────────────────┘
       ⚠ גם אם WhatsApp נכשל → status='sent' בכל מקרה
```

---

## 2. יחסי FK בין טבלאות (דיאגרמה)

```
                             suppliers  ◄──┐
                                 ▲          │
                                 │          │
                      supplier_products─────┘  (CASCADE)
                                 
                      price_history ───► suppliers  (CASCADE)
                      price_history ───► supplier_products  (no cascade)

  purchase_requests ◄──── purchase_request_items (CASCADE)
        ▲
        │ (NO cascade — nullable FK)
        │
       rfqs ◄──── rfq_recipients (CASCADE to rfq / NO cascade to supplier)
        ▲
        │ (NO cascade)
        │
   supplier_quotes ◄──── quote_line_items (CASCADE)
        │
        │ (FK → rfqs, suppliers — NO cascade)
        │
        ▼
   purchase_orders ◄──── po_line_items (CASCADE)
        │
        │ (FK → rfqs, suppliers — NO cascade)
        │
        ▼
   procurement_decisions
        │
        └── FK → rfqs, purchase_requests, purchase_orders, suppliers (NO cascade)

   subcontractors ◄──── subcontractor_pricing (CASCADE)
        ▲
        │ (NO cascade)
        │
   subcontractor_decisions  ── FK → subcontractors (NO cascade)
```

### טבלת cascade מלאה

| Child                   | Parent             | ON DELETE  |
|-------------------------|--------------------|------------|
| supplier_products       | suppliers          | CASCADE    |
| price_history           | suppliers          | CASCADE    |
| price_history           | supplier_products  | (implicit NO ACTION) |
| purchase_request_items  | purchase_requests  | CASCADE    |
| rfqs                    | purchase_requests  | NO ACTION  |
| rfq_recipients          | rfqs               | CASCADE    |
| rfq_recipients          | suppliers          | NO ACTION  |
| supplier_quotes         | rfqs               | NO ACTION  |
| supplier_quotes         | suppliers          | NO ACTION  |
| quote_line_items        | supplier_quotes    | CASCADE    |
| quote_line_items        | purchase_request_items | NO ACTION |
| purchase_orders         | rfqs               | NO ACTION  |
| purchase_orders         | suppliers          | NO ACTION  |
| po_line_items           | purchase_orders    | CASCADE    |
| procurement_decisions   | rfqs, purchase_requests, purchase_orders, suppliers | NO ACTION |
| subcontractor_pricing   | subcontractors     | CASCADE    |
| subcontractor_decisions | subcontractors     | NO ACTION  |

### חור קריטי בתכנון
- **purchase_orders → rfqs** אינו cascade. מחיקת RFQ לא תמחק PO — אבל עלולה להשאיר PO עם `rfq_id` שבור (אם rfqs ND איסור מחיקה חיצוני).
- **supplier_quotes → rfqs** אינו cascade. מחיקת RFQ מותרת רק אם אין quotes, אחרת FK violation.
- **rfq_recipients.supplier_id** NO CASCADE — מחיקת ספק חסומה כל עוד יש RFQ recipients.

---

## 3. נקודות שבירה לכל Hop (Per-flow fragile points)

### Hop 1: `POST /api/purchase-requests`
- **שבירה #1:** `supabase.from('purchase_requests').insert(...)` מחזיר שגיאה → לקוח מקבל 400, אין PR, אין items. תקין.
- **שבירה #2:** PR נוצר בהצלחה, ואז `supabase.from('purchase_request_items').insert(itemsWithRequestId)` נכשל (שגיאת רשת / שדה חובה חסר / check constraint). **התוצאה נשלחת עם 201 Created**, אבל ה-DB מכיל PR ללא פריטים. **אין `await` על return value של items insert** — שגיאה נבלעת!
- **שבירה #3:** `audit(...)` נכשל → מתעלם מכך. אין לוג שפעולה התרחשה.
- **גם בהצלחה:** התגובה מחזירה `{ request, items }` — אבל `items` הוא המערך המקורי מה-`req.body`, לא הנתונים שהוכנסו ל-DB (חסר ID, `created_at`).

### Hop 2: `POST /api/rfq/send`
- **שבירה #4:** אם `purchase_request_id` לא קיים → `request` הוא `null`, אבל בודקים רק `if (!request)`. בשלב `request.purchase_request_items.map(...)` — אם אין items → `cats` ריק → `categories.length === 0` → אזהרה "לא נמצאו ספקים".
- **שבירה #5:** בין `supabase.from('rfqs').insert(...)` לבין הלולאה על הספקים — אין `error` handler. אם ה-insert נכשל → `rfq` = `undefined` → `rfq.id` זורק.
- **שבירה #6:** **הלולאה על הספקים אינה אטומית.** אם `sendWhatsApp` נכשל על ספק שלישי באמצע — הספקים 1-2 כבר רשומים ב-`rfq_recipients`, הספקים 4+ לא יישלחו, אבל **ה-RFQ כבר קיים**. אין רשומה שאומרת "נסו שוב מספק 3".
- **שבירה #7:** `UPDATE purchase_requests SET status='rfq_sent'` יכול להצליח גם אם הלולאה נכשלה לגמרי → PR יופיע כ"נשלח" בלי שום `rfq_recipients` אמיתי.
- **שבירה #8:** אין throttling/rate-limit על WhatsApp — 30 ספקים בלולאה רצופה יחטפו 429 מ-Meta.

### Hop 3: `POST /api/quotes`
- **שבירה #9:** הזנת quote **לא מוודאת** שה-`rfq_id` קיים או שה-RFQ עדיין במצב `sent`/`collecting`. אפשר להזין quote ל-RFQ שכבר `decided` או `cancelled`.
- **שבירה #10:** אין `UNIQUE(rfq_id, supplier_id)` על `supplier_quotes`. שתי קריאות מאותו ספק יוצרות שתי רשומות — ה-`decide` ישקול את שתיהן.
- **שבירה #11:** `supplier_quotes` insert הצליח → `quote_line_items` insert נכשל. `total_price` של ה-quote קיים, אבל בלי פריטים. **קריאת decide תחשב את ה-total** — בלי לדעת שאין line items, ו-`po_line_items` יועתק מרשימה ריקה → PO ריק.
- **שבירה #12:** `rfq_recipients.status='quoted'` — אם הספק לא היה ב-recipients (למשל, אדם הוסיף quote ידני לספק שלא היה ב-RFQ המקורי), ה-UPDATE פשוט לא ימצא שורה ולא יעדכן כלום — בלי שגיאה.
- **שבירה #13:** `price_history.insert` בלולאה — אם אחת נכשלת השאר ממשיכות בלי אזהרה.

### Hop 4: `POST /api/rfq/:id/decide`
- **שבירה #14:** `Math.max(...quotes.map(q => q.total_price))` — אם `quotes` = [] זה `-Infinity`, אבל יש בדיקה `quotes.length < 1`. כאשר `min_quotes_before_decision` בסכמה הוא 2 — הקוד אינו בודק את זה ומאפשר decide על quote יחיד.
- **שבירה #15:** **אין אטומיות.** `purchase_orders.insert` הצליח → `po_line_items.insert` נכשל → PO ריק. `procurement_decisions.insert` נכשל אחרי PO → PO יתום ללא decision. עדכון `suppliers.total_orders` נכשל → סטטיסטיקה שגויה.
- **שבירה #16:** עדכון suppliers stats **Race hazard**: read-modify-write ידני. שני quotes מנצחים באותו ספק (הגזמה, אבל אפשרי) → `total_orders + 1` יתבצע על אותו ערך, ויאבד.
- **שבירה #17:** `decide` קוראים פעמיים → שני PO-ים נוצרים על אותו RFQ, שני `procurement_decisions`. אין `rfq.status = 'decided'` בדיקה בכניסה.
- **שבירה #18:** `winnerQuote.vat_amount` משמש ל-PO — אבל בחישוב בוחרים את `winner.total_with_vat` שמגיע מ-`quote.total_with_vat`. אם ה-quote עצמו חושב שגוי — הבאג מתפשט ל-PO.

### Hop 5: `POST /api/purchase-orders/:id/approve`
- **שבירה #19:** אין ולידציית מעבר: אפשר לאשר PO שכבר `sent`, `closed`, `cancelled`, או `disputed`. ה-status פשוט מודחק ל-`approved`.
- **שבירה #20:** PO שלא קיים — `data` יהיה `null`/error, אבל הקוד ניגש ל-`data.id` בשורה הבאה → crash 500.
- **שבירה #21:** אין בדיקה ש-`approved_by` קיים ב-body.

### Hop 6: `POST /api/purchase-orders/:id/send`
- **שבירה #22:** `WA_TOKEN` לא מוגדר → `sendResult = { success: false }` → אבל **ה-status עדיין מתעדכן ל-`sent`**. הספק לעולם לא קיבל הזמנה.
- **שבירה #23:** אין בדיקת מעבר: אפשר לשלוח PO שב-`draft` (לא אושר) או `sent` (שליחה כפולה).
- **שבירה #24:** אם `po.po_line_items` ריק → `map` מחזיר מחרוזת ריקה → הודעת WhatsApp תיראה שבורה.
- **שבירה #25:** `supplier.whatsapp || supplier.phone` — אם שניהם null, `address` יהיה `undefined`, אבל הקוד עדיין מנסה `sendWhatsApp(undefined, ...)`.

---

## 4. טבלת רשומות יתומות (Orphan Records)

| תרחיש כישלון                           | רשומה יתומה שנוצרת                                | לאן לחפש            |
|----------------------------------------|-----------------------------------------------------|---------------------|
| PR OK, items insert נכשל                | `purchase_requests` ללא `purchase_request_items` | `SELECT pr FROM purchase_requests pr LEFT JOIN purchase_request_items i ON i.request_id=pr.id WHERE i.id IS NULL` |
| RFQ insert OK, לולאת ספקים נפלה באמצע  | `rfqs` עם חלק מ-`rfq_recipients` בלבד             | `rfqs` עם `COUNT(rfq_recipients) < suppliers_expected` |
| purchase_requests.status='rfq_sent' אבל LOOP נכשל לגמרי | PR במצב rfq_sent ללא recipients    | `SELECT pr WHERE status='rfq_sent' AND NOT EXISTS (SELECT 1 FROM rfq_recipients ...)` |
| Quote OK, line_items insert נכשל        | `supplier_quotes` ללא `quote_line_items`         | `SELECT q FROM supplier_quotes q LEFT JOIN quote_line_items l ON l.quote_id=q.id WHERE l.id IS NULL` |
| decide: PO OK, po_line_items נכשל       | `purchase_orders` ללא `po_line_items`             | `SELECT po WHERE NOT EXISTS po_line_items` |
| decide: PO OK, procurement_decisions נכשל | PO יתום בלי החלטה                                | `SELECT po WHERE source='rfq' AND NOT EXISTS procurement_decisions` |
| decide: decision OK, rfqs UPDATE status נכשל | החלטה קיימת, RFQ עדיין 'sent'                  | `rfqs WHERE status='sent' AND EXISTS procurement_decisions` |
| decide: suppliers stats UPDATE נכשל     | total_orders לא עודכן, פער באנליטיקה              | השוואה בין COUNT(po) לבין suppliers.total_orders |
| decide נקרא פעמיים                     | 2 × PO, 2 × procurement_decisions, סטטיסטיקה כפולה | `SELECT rfq_id, COUNT(*) FROM procurement_decisions GROUP BY 1 HAVING COUNT(*)>1` |
| PO send: WhatsApp נכשל, status מעודכן   | purchase_orders.status='sent' אבל לא נשלח         | `audit_log WHERE action='sent' AND detail LIKE '%WhatsApp%'` — לא ניתן להבדיל! |
| subcontractor decide נקרא              | `subcontractor_decisions` קיים, אך אין order מעשי | `subcontractor_decisions WHERE work_order_sent=false` — **כולם!** (ראה סעיף 6) |

---

## 5. מטריצת Race Conditions

| תרחיש במקביל                                                              | התוצאה                                                    | חומרה |
|---------------------------------------------------------------------------|-----------------------------------------------------------|-------|
| 2 × `POST /api/quotes` מאותו ספק לאותו RFQ                                | 2 רשומות `supplier_quotes` (אין UNIQUE). decide ישקול שתיהן. | HIGH  |
| `POST /api/quotes` + `POST /api/rfq/:id/decide` במקביל                    | decide קורא quotes כ-SELECT — אם quote נכנס אחרי ה-SELECT, הוא יתעלם ממנו. | HIGH  |
| 2 × `POST /api/rfq/:id/decide` במקביל                                     | 2 × PO, 2 × procurement_decisions, 2 × עדכון סטטיסטיקות | HIGH  |
| `decide` בזמן שב-`supplier_quotes` עדיין אין line_items (quote חצי-מוכנס) | PO ייבנה עם `quote_line_items=[]` → po_line_items ריק     | CRITICAL |
| 2 × `POST /api/rfq/send` עם אותו `purchase_request_id`                   | 2 × rfqs, 2 × recipients, PR.status תוחלף ל-rfq_sent פעמיים | MEDIUM |
| `approve` + `send` במקביל על אותו PO                                      | אפשרי state=sent בלי approve, או approved_at מאוחר מה-sent_at | HIGH |
| עדכון `suppliers.total_orders` בשתי decide במקביל                         | אובדן עדכון (lost update) — read-modify-write לא אטומי  | MEDIUM |
| מחיקת ספק פעיל בזמן `rfq/send`                                            | FK error ב-`rfq_recipients` — אבל חלק מה-recipients כבר נוצרו | MEDIUM |
| WhatsApp webhook (`/webhook/whatsapp`) כותב `system_events` + `rfq/send` לאותו RFQ | אין קונפליקט מכיוון שהטבלאות שונות; אין סיכון ישיר | LOW |
| הוספת quote ל-RFQ במצב `decided` (אחרי decide)                           | אין ולידציה — quote חדש יישאר יתום (`rfq_recipients` עודכן אבל לא PO) | MEDIUM |

**שורש כל הבעיות:** אין שימוש ב-`supabase.rpc()` / PL/pgSQL / סטורד פרוצדורות. כל פעולה היא CRUD יחיד. אין `BEGIN/COMMIT`.

---

## 6. פערי פעולה חסרה (Missing Actions Gaps)

### 6.1 Subcontractor — הפער הראשי שצוין במשימה
`POST /api/subcontractors/decide`:
- **כן עושה:** `INSERT INTO subcontractor_decisions`.
- **לא עושה:**
  - **אינו שולח הודעת WhatsApp** לקבלן הנבחר — אין `sendWhatsApp(winner.phone, ...)`.
  - **אינו יוצר "work order"** — אין טבלת work_orders, אין insert, אין קריאה חיצונית.
  - `subcontractor_decisions.work_order_sent` נשאר `false` **תמיד** (ברירת מחדל).
  - `sent_at`, `sent_via` — לעולם לא מתעדכנים.
  - אין עדכון `subcontractors.total_projects` או `total_revenue`.
  - אין audit log.
  - אין system_events.
- **השפעה:** לקבלן המוצלח אין מושג שהוא נבחר; צוות הלוגיסטיקה רואה "החלטה" בלי שום action downstream. אנליטיקות המבוססות על `work_order_sent` יראו 0 תמיד.

### 6.2 פערים נוספים שנמצאו
1. **אין איסוף quotes גולמי מ-WhatsApp.** ה-webhook רק רושם ל-`system_events`. אין פרסור להצעת מחיר, אין match ל-`rfq_id`, אין `POST /api/quotes` אוטומטי.
2. **אין reminder logic.** הסכמה מכילה `reminder_after_hours`, `reminder_sent`, `reminder_sent_at` אבל שום endpoint לא משתמש בזה. קבלני משנה וספקים שלא הגיבו לעולם לא יקבלו תזכורת.
3. **אין `auto_close_on_deadline`.** הסכמה תומכת, אבל אין cron/poller שמזיז RFQ ל-`closed` אחרי `response_deadline`.
4. **אין delivery tracking.** PO עובר ל-`sent` ואחר כך… אין endpoint ל-`confirmed`, `shipped`, `delivered`, `inspected`. המצבים הללו קיימים ב-CHECK constraint אבל קוד לא משתמש.
5. **אין quality inspection.** `quality_score`, `quality_result` בטבלת PO — אין endpoint.
6. **אין notifications.** טבלת `notifications` קיימת, אין INSERT בשום מקום.
7. **אין ניהול מלאי.** מוצר נרכש, אבל אין שינוי כמות בסטוק (אין טבלת inventory בכלל).
8. **`min_quotes_before_decision` מהסכמה אינו נאכף.** ברירת מחדל 2, אבל `decide` בודק רק `< 1`.
9. **`purchase_requests.status` ל-`quotes_received`** — לא מתעדכן בשום מקום. הקוד קופץ מ-`rfq_sent` ישירות ל-... כלום (ה-decide רק מעדכן את ה-rfq, לא את ה-PR).
10. **`purchase_requests.status='ordered'/'delivered'/'cancelled'`** — אף אחד מהמצבים האלה לא מיוצר על ידי הקוד.
11. **`audit_log` ב-`POST /api/quotes`** קורא `await audit('quote', quote.id, 'received', quoteData.supplier_name, ...)` — אבל `supplier_name` הוא טקסט חופשי, לא FK. ב-audit hoards זה אוקיי, אבל אין validation שהוא תואם ל-`supplier_id`.

---

## 7. State Transitions — סיכום

### `purchase_requests.status`
| From → To           | נאכף?  | איפה בקוד                         |
|---------------------|--------|-----------------------------------|
| `draft`             | init   | `POST /api/purchase-requests` (ברירת מחדל) |
| `→ rfq_sent`        | No     | `POST /api/rfq/send` (UPDATE ללא WHERE status=) |
| `→ quotes_received` | **אין**| —                                 |
| `→ decided`         | **אין**| — (רק rfqs.status עודכן)          |
| `→ ordered`         | **אין**| —                                 |
| `→ delivered`       | **אין**| —                                 |
| `→ cancelled`       | **אין**| —                                 |

### `rfqs.status`
| From → To        | נאכף?      | איפה בקוד                          |
|------------------|------------|------------------------------------|
| `sent`           | init       | `POST /api/rfq/send` insert        |
| `→ collecting`   | **אין**    | — (אין endpoint)                   |
| `→ closed`       | **אין**    | — (אין poller / auto_close)         |
| `→ decided`      | No         | `POST /api/rfq/:id/decide` UPDATE ללא WHERE |
| `→ cancelled`    | **אין**    | —                                  |

### `purchase_orders.status`
| From → To            | נאכף? | איפה בקוד                           |
|----------------------|--------|--------------------------------------|
| `draft`              | init   | `decide()` insert                    |
| `→ pending_approval` | **אין**| —                                    |
| `→ approved`         | No     | `approve()` UPDATE ללא WHERE status= |
| `→ sent`             | No     | `send()` UPDATE גם אם WA נכשל       |
| `→ confirmed`        | **אין**| —                                    |
| `→ shipped`          | **אין**| —                                    |
| `→ delivered`        | **אין**| —                                    |
| `→ inspected`        | **אין**| —                                    |
| `→ closed`           | **אין**| —                                    |
| `→ cancelled`        | **אין**| —                                    |
| `→ disputed`         | **אין**| —                                    |

**מסקנה:** 9 מתוך 11 מצבי PO, 4 מתוך 5 מצבי RFQ, ו-5 מתוך 7 מצבי PR — **אין להם דרך להגיע אליהם דרך ה-API**. ה-CHECK constraints בסכמה מתארים מערכת גדולה הרבה יותר ממה שיושמה.

---

## 8. סיכום סיכונים לפי חומרה

| חומרה    | מספר פערים | דוגמאות                                                      |
|----------|-------------|--------------------------------------------------------------|
| CRITICAL | 4           | decide ללא line_items; subcontractor — אין work order בכלל; send PO ששיגור נכשל → status='sent'; אין transactional safety בשום flow |
| HIGH     | 6           | race conditions על quotes/decide; double-decide; double-approve; אין UNIQUE(rfq,supplier); missing reminder/close logic |
| MEDIUM   | 8           | lost-updates בסטטיסטיקת suppliers; audit fail swallowed; purchase_requests status לא מתעדכן; אין tracking/quality/notifications |
| LOW      | 3           | ניסוח הודעות RFQ; webhook log בלבד; חוסר rate limit ב-WhatsApp  |
