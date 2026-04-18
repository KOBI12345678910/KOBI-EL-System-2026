# ONYX Procurement — API Reference / מסמך ייחוס API

Version: 1.0.0
Base URL: `http://localhost:3100` (default — override via `PORT` env)
Content-Type: `application/json` unless noted

---

## Table of Contents / תוכן עניינים

1. [Authentication / אימות](#authentication--אימות)
2. [Error Model / מודל שגיאות](#error-model--מודל-שגיאות)
3. [System / מערכת](#system--מערכת)
4. [Procurement — Suppliers / ספקים](#procurement--suppliers--ספקים)
5. [Procurement — Purchase Requests / בקשות רכש](#procurement--purchase-requests--בקשות-רכש)
6. [Procurement — RFQ / בקשות הצעות](#procurement--rfq--בקשות-הצעות)
7. [Procurement — Quotes / הצעות מחיר](#procurement--quotes--הצעות-מחיר)
8. [Procurement — Purchase Orders / הזמנות רכש](#procurement--purchase-orders--הזמנות-רכש)
9. [Procurement — Subcontractors / קבלני משנה](#procurement--subcontractors--קבלני-משנה)
10. [VAT / מע"מ](#vat--מעמ)
11. [Annual Tax / מס שנתי](#annual-tax--מס-שנתי)
12. [Bank Reconciliation / התאמות בנק](#bank-reconciliation--התאמות-בנק)
13. [Payroll / שכר](#payroll--שכר)
14. [Analytics / דוחות](#analytics--דוחות)
15. [Audit Log / יומן ביקורת](#audit-log--יומן-ביקורת)
16. [Webhooks / Webhooks](#webhooks--webhooks)

---

## Authentication / אימות

Most API routes are protected by the `requireAuth` middleware, controlled by the `AUTH_MODE` environment variable.

Modes:

- `api_key` (default when `API_KEYS` is set) — client must send one of the configured keys.
- `disabled` — auth is skipped; `req.actor` becomes `anonymous`.

The key is sent in the `X-API-Key` request header or in an `Authorization: Bearer <key>` header.

```
X-API-Key: onyx_live_xxx
```

**Public routes (no auth required):**

- `GET /api/status`
- `GET /api/health`

All other `/api/*` routes require a valid key. `/webhook/whatsapp` uses HMAC-SHA256 instead (header `X-Hub-Signature-256`).

---

## Error Model / מודל שגיאות

Standard JSON error envelope:

```json
{ "error": "Human-readable message" }
```

Common HTTP statuses returned by the server:

| Code | Meaning | Typical cause |
| ---- | ------- | ------------- |
| 400  | Bad Request | Missing required field, invalid body, Supabase insert/update constraint violation |
| 401  | Unauthorized | Missing or wrong `X-API-Key` / invalid webhook HMAC |
| 403  | Forbidden | WhatsApp verification challenge failed |
| 404  | Not Found | Resource not found (supplier, period, invoice, employee, etc.) |
| 409  | Conflict | Period already closed/submitted, RFQ already decided, duplicate wage slip |
| 410  | Gone | PCN836 archive file missing from disk |
| 412  | Precondition Failed | Profile/fiscal year not yet configured |
| 422  | Unprocessable Entity | PCN836 validation failure, bank statement parse failure |
| 429  | Too Many Requests | Rate-limit exceeded (300 req / 15 min on `/api/*`) |
| 500  | Internal Server Error | Unhandled exception or Supabase error |
| 502  | Bad Gateway | Outbound WhatsApp / SMS transmission failed |

Production builds redact stack traces (`NODE_ENV=production`).

---

## System / מערכת

### `GET /api/status`

**HE:** סטטוס מלא של המערכת (ציבורי, ללא auth).
**EN:** Full engine status including dashboard counters. Public, no auth.

Response 200:

```json
{
  "engine": "ONYX Procurement System",
  "version": "1.0.0",
  "status": "operational",
  "timestamp": "2026-04-11T08:00:00.000Z",
  "dashboard": { "active_rfqs": 3, "open_pos": 12, "unpaid_invoices": 5 },
  "whatsapp": "configured",
  "supabase": "connected"
}
```

Example:

```bash
curl http://localhost:3100/api/status
```

---

### `GET /api/health`

**HE:** health-check — ציבורי, מחזיר uptime. לשימוש load balancer / ניטור.
**EN:** Lightweight liveness probe. Public.

Response 200:

```json
{ "status": "ok", "uptime": 1234.56, "timestamp": "2026-04-11T08:00:00.000Z" }
```

Example:

```bash
curl http://localhost:3100/api/health
```

---

### `GET /healthz`

**HE:** Kubernetes-style liveness + metadata. ציבורי. תמיד מחזיר 200.
**EN:** K8s-style liveness probe with service metadata (name, version, uptime). Always 200. Public.

Response 200:

```json
{ "ok": true, "service": "onyx-procurement", "version": "1.0.0", "uptime": 1234.56 }
```

```bash
curl http://localhost:3100/healthz
```

---

### `GET /livez`

**HE:** בדיקת חיות פשוטה. תמיד 200.
**EN:** Pure liveness. Always 200. Public.

Response 200: `{ "alive": true }`

```bash
curl http://localhost:3100/livez
```

---

### `GET /readyz`

**HE:** בדיקת readiness — מנסה לפנג ל-Supabase עם timeout של 2 שניות. מחזיר 503 אם ה-DB לא עונה.
**EN:** Readiness probe. Pings Supabase (`suppliers` table head-count) with a 2-second timeout. Returns 503 if the DB errors or times out.

Response 200: `{ "ready": true, "service": "onyx-procurement" }`
Response 503: `{ "ready": false, "reason": "db_timeout_2s" | "db_error:..." }`

```bash
curl http://localhost:3100/readyz
```

---

### `GET /metrics`

**HE:** metrics בפורמט Prometheus (text). נרשם ע"י `src/ops/metrics`. ציבורי (או לפי מה ש-`metricsMiddleware` הגדיר).
**EN:** Prometheus text-format metrics exposed via `src/ops/metrics`. Public — no API key required. Only wired if the module loads at boot.

Response 200 (`text/plain`): Prometheus exposition format, e.g.

```
# HELP http_requests_total Total HTTP requests
# TYPE http_requests_total counter
http_requests_total{method="GET",status="200"} 1234
```

```bash
curl http://localhost:3100/metrics
```

---

## Procurement — Suppliers / ספקים

### `GET /api/suppliers`

**HE:** רשימת כל הספקים מדורגת לפי `overall_score` (מה-view `supplier_dashboard`).
**EN:** List all suppliers, sorted by overall score (from `supplier_dashboard` view).

Auth: required.
Response 200: `{ "suppliers": [ ... ] }`
Errors: 500.

```bash
curl -H "X-API-Key: $KEY" http://localhost:3100/api/suppliers
```

---

### `GET /api/suppliers/:id`

**HE:** קבלת פרטי ספק בודד עם מוצריו והיסטוריית מחירים (50 אחרונות).
**EN:** Fetch a single supplier, its products, and price history (latest 50).

Auth: required.
Response 200: `{ "supplier": {}, "products": [], "priceHistory": [] }`
Errors: 404 (not found), 500.

```bash
curl -H "X-API-Key: $KEY" http://localhost:3100/api/suppliers/42
```

---

### `POST /api/suppliers`

**HE:** יצירת ספק חדש. body = עמודות טבלת `suppliers`.
**EN:** Create a new supplier. Body is a raw row for the `suppliers` table.

Auth: required.
Request body (example):

```json
{
  "name": "אבי ציוד",
  "phone": "050-1234567",
  "whatsapp": "972501234567",
  "email": "avi@example.com",
  "preferred_channel": "whatsapp",
  "active": true,
  "created_by": "admin@co.il"
}
```

Response 201: `{ "supplier": { ... } }`
Errors: 400 (insert failed), 500.

```bash
curl -X POST -H "X-API-Key: $KEY" -H "Content-Type: application/json" \
  -d '{"name":"אבי ציוד","phone":"050-1234567","active":true}' \
  http://localhost:3100/api/suppliers
```

---

### `PATCH /api/suppliers/:id`

**HE:** עדכון ספק קיים. audit log נשמר.
**EN:** Partial update; audit log captures previous and new values.

Auth: required.
Request body: any subset of supplier columns.
Response 200: `{ "supplier": { ... } }`
Errors: 400, 500.

```bash
curl -X PATCH -H "X-API-Key: $KEY" -H "Content-Type: application/json" \
  -d '{"active":false}' \
  http://localhost:3100/api/suppliers/42
```

---

### `POST /api/suppliers/:id/products`

**HE:** הוספת מוצר לספק.
**EN:** Add a product row linked to this supplier (`supplier_id` auto-populated from path).

Auth: required.
Request body:

```json
{
  "name": "מסמר 4 אינץ'",
  "category": "fasteners",
  "unit": "kg",
  "unit_price": 12.5
}
```

Response 201: `{ "product": { ... } }`
Errors: 400, 500.

```bash
curl -X POST -H "X-API-Key: $KEY" -H "Content-Type: application/json" \
  -d '{"name":"מסמר 4","category":"fasteners","unit_price":12.5}' \
  http://localhost:3100/api/suppliers/42/products
```

---

### `GET /api/suppliers/search/:category`

**HE:** איתור ספקים לפי קטגוריה (מחזיר את הספקים שיש להם מוצר בקטגוריה).
**EN:** Find active suppliers that carry at least one product in the given category.

Auth: required.
Response 200: `{ "suppliers": [ { "id": 1, "name": "...", "matchedProduct": "..." } ] }`

```bash
curl -H "X-API-Key: $KEY" http://localhost:3100/api/suppliers/search/cement
```

---

## Procurement — Purchase Requests / בקשות רכש

### `POST /api/purchase-requests`

**HE:** יצירת בקשת רכש + פריטים בבת אחת.
**EN:** Create a purchase request with its line items in one call.

Auth: required.
Request body:

```json
{
  "requested_by": "kobi@co.il",
  "priority": "high",
  "notes": "Site: Tel-Aviv",
  "items": [
    { "name": "קמנט אפור", "category": "cement", "quantity": 100, "unit": "bag", "specs": "CEM II 42.5N" }
  ]
}
```

Response 201: `{ "request": { ... }, "items": [ ... ] }`
Errors: 400, 500.

```bash
curl -X POST -H "X-API-Key: $KEY" -H "Content-Type: application/json" \
  -d '{"requested_by":"kobi@co.il","items":[{"name":"קמנט","category":"cement","quantity":100,"unit":"bag"}]}' \
  http://localhost:3100/api/purchase-requests
```

---

### `GET /api/purchase-requests`

**HE:** רשימת בקשות רכש עם הפריטים הקשורים.
**EN:** List all purchase requests with their joined items, newest first.

Auth: required.
Response 200: `{ "requests": [ ... ] }`

```bash
curl -H "X-API-Key: $KEY" http://localhost:3100/api/purchase-requests
```

---

## Procurement — RFQ / בקשות הצעות

### `POST /api/rfq/send`

**HE:** שליחת בקשת הצעת מחיר לכל הספקים המתאימים לקטגוריות הפריטים בבקשה, דרך WhatsApp או SMS.
**EN:** Fan-out an RFQ to every active supplier whose product catalog covers at least one of the request's item categories. Uses each supplier's preferred channel (WhatsApp → Facebook Graph API, SMS → Twilio).

Auth: required.
Request body:

```json
{
  "purchase_request_id": 15,
  "categories": ["cement", "rebar"],
  "response_window_hours": 24,
  "company_note": "אנא מחיר לפני מע\"מ"
}
```

`categories` is optional — if omitted, the server infers it from the request's line items.

Response 201:

```json
{
  "rfq_id": 88,
  "rfq_code": "RFQ-LXT8G4",
  "suppliers_contacted": 7,
  "delivered": 6,
  "deadline": "2026-04-12T09:00:00.000Z",
  "results": [
    { "supplier": "אבי", "channel": "whatsapp", "delivered": true, "messageId": "wamid.ABC" }
  ],
  "message": "📤 נשלח ל-6/7 ספקים"
}
```

Errors: 400 (no suppliers for categories), 404 (purchase request not found), 500.

```bash
curl -X POST -H "X-API-Key: $KEY" -H "Content-Type: application/json" \
  -d '{"purchase_request_id":15,"response_window_hours":24}' \
  http://localhost:3100/api/rfq/send
```

---

### `GET /api/rfq/:id`

**HE:** מצב RFQ כולל נמענים והצעות שהתקבלו.
**EN:** Fetch an RFQ with its recipients and any quotes received.

Auth: required.
Response 200: `{ "rfq": {}, "recipients": [], "quotes": [] }`

```bash
curl -H "X-API-Key: $KEY" http://localhost:3100/api/rfq/88
```

---

### `GET /api/rfqs`

**HE:** רשימת כל ה-RFQ מה-view `rfq_summary`.
**EN:** List RFQs from the `rfq_summary` view, newest first.

Auth: required.
Response 200: `{ "rfqs": [ ... ] }`

```bash
curl -H "X-API-Key: $KEY" http://localhost:3100/api/rfqs
```

---

## Procurement — Quotes / הצעות מחיר

### `POST /api/quotes`

**HE:** קליטת הצעת מחיר מספק. המערכת מחשבת subtotal / VAT / total — אם `vat_included=true` מחלצת net מהמחירים, אחרת מוסיפה VAT על top.
**EN:** Record a supplier quote. Server recomputes `subtotal`, `vat_amount`, `total_with_vat` — if `vat_included=true` the incoming prices are treated as gross and net values are extracted, otherwise VAT is added on top.

Auth: required.
Request body:

```json
{
  "rfq_id": 88,
  "supplier_id": 42,
  "supplier_name": "אבי ציוד",
  "delivery_days": 3,
  "delivery_fee": 150,
  "free_delivery": false,
  "vat_included": false,
  "payment_terms": "שוטף+30",
  "line_items": [
    { "name": "קמנט CEM II", "category": "cement", "quantity": 100, "unit": "bag", "unit_price": 35, "discount_percent": 5 }
  ]
}
```

Response 201:

```json
{
  "quote": { "id": 201, "subtotal": 3325, "vat_amount": 590, "total_with_vat": 4065, "line_items": [ ... ] },
  "message": "📥 הצעה מ-אבי ציוד: ₪3,475"
}
```

Errors: 400, 500.

```bash
curl -X POST -H "X-API-Key: $KEY" -H "Content-Type: application/json" \
  -d '{"rfq_id":88,"supplier_id":42,"supplier_name":"אבי","delivery_days":3,"line_items":[{"name":"קמנט","quantity":100,"unit":"bag","unit_price":35}]}' \
  http://localhost:3100/api/quotes
```

---

### `POST /api/rfq/:id/decide`

**HE:** אלגוריתם AI פנימי שבוחר את ההצעה הטובה ביותר לפי 4 משקלים (מחיר, אספקה, דירוג, אמינות). המשקלים מתנרמלים לסכום 1. יוצר במקביל הזמנת רכש (PO) עבור המנצח.
**EN:** In-process scoring algorithm that picks the best quote from a weighted combination of four factors. Weights are clamped to [0,1] and normalized. The endpoint also creates a `purchase_orders` row for the winner and copies its line items.

Auth: required.
Request body:

```json
{
  "price_weight": 0.5,
  "delivery_weight": 0.15,
  "rating_weight": 0.2,
  "reliability_weight": 0.15,
  "decided_by": "kobi",
  "force": false
}
```

All weights optional (defaults shown). Set `force=true` to re-decide an already-decided RFQ.

Response 200:

```json
{
  "decision_id": 17,
  "purchase_order_id": 301,
  "winner": { "supplier_name": "אבי", "total_price": 3475, "weighted_score": 87, "rank": 1 },
  "all_quotes": [ ... ],
  "savings": { "amount": 650, "percent": 15.7 },
  "reasoning": [ "...", "..." ],
  "message": "🏆 אבי ציוד נבחר — חיסכון ₪650 (15.7%)"
}
```

Errors: 400 (no quotes, all weights zero), 404 (RFQ not found), 409 (already decided, no `force`), 500.

```bash
curl -X POST -H "X-API-Key: $KEY" -H "Content-Type: application/json" \
  -d '{"price_weight":0.6}' \
  http://localhost:3100/api/rfq/88/decide
```

---

## Procurement — Purchase Orders / הזמנות רכש

### `GET /api/purchase-orders`

**HE:** רשימת כל ההזמנות + פריטיהן.
**EN:** List all purchase orders (with joined `po_line_items`), newest first.

Auth: required.
Response 200: `{ "orders": [ ... ] }`

```bash
curl -H "X-API-Key: $KEY" http://localhost:3100/api/purchase-orders
```

---

### `GET /api/purchase-orders/:id`

**HE:** פרטי הזמנה בודדת עם פריטים.
**EN:** Fetch a single purchase order with its line items.

Auth: required.
Response 200: `{ "order": { ... } }`

```bash
curl -H "X-API-Key: $KEY" http://localhost:3100/api/purchase-orders/301
```

---

### `POST /api/purchase-orders/:id/approve`

**HE:** אישור הזמנה (status → `approved`).
**EN:** Mark the PO approved. Does NOT send it — that's `/send`.

Auth: required.
Request body:

```json
{ "approved_by": "kobi" }
```

Response 200: `{ "order": { ... }, "message": "✅ הזמנה אושרה" }`

```bash
curl -X POST -H "X-API-Key: $KEY" -H "Content-Type: application/json" \
  -d '{"approved_by":"kobi"}' \
  http://localhost:3100/api/purchase-orders/301/approve
```

---

### `POST /api/purchase-orders/:id/send`

**HE:** שליחת ההזמנה לספק ב-WhatsApp. אם ההודעה נכשלה, סטטוס ההזמנה הופך ל-`send_failed` וה-API מחזיר `502`.
**EN:** Render the PO as a text WhatsApp message and send via Graph API. Status only flips to `sent` if transmission actually succeeded; otherwise the PO is marked `send_failed`, `last_send_error` is stored, and the response is **HTTP 502**.

Auth: required.
Request body: `{ "sent_by": "kobi" }`
Response 200 (success) / 502 (failure):

```json
{ "sent": true, "messageId": "wamid.ABC", "message": "📤 הזמנה נשלחה" }
```

Errors: 404, 502.

```bash
curl -X POST -H "X-API-Key: $KEY" http://localhost:3100/api/purchase-orders/301/send
```

---

## Procurement — Subcontractors / קבלני משנה

### `GET /api/subcontractors`

**HE:** כל קבלני המשנה עם תעריפיהם, מדורג לפי `quality_rating`.
**EN:** List subcontractors with nested `subcontractor_pricing` rows, sorted by quality rating.

Auth: required.
Response 200: `{ "subcontractors": [ ... ] }`

---

### `POST /api/subcontractors`

**HE:** יצירת קבלן משנה חדש + תעריפיו.
**EN:** Create a subcontractor. Optional `pricing` array creates the linked pricing rows in one call.

Auth: required.
Request body:

```json
{
  "name": "שלמה ריצוף",
  "phone": "050-9999999",
  "quality_rating": 9,
  "reliability_rating": 8,
  "available": true,
  "pricing": [
    { "work_type": "tiling", "percentage_rate": 18, "price_per_sqm": 120, "minimum_price": 5000 }
  ]
}
```

Response 201: `{ "subcontractor": { ... } }`
Errors: 400, 500.

---

### `PUT /api/subcontractors/:id/pricing`

**HE:** עדכון/יצירת תעריף עבור work_type. upsert עם audit — זו נקודת הונאה רגישה ולכן קיים תיעוד מלא.
**EN:** Upsert a pricing row (by `subcontractor_id` + `work_type`). Full audit trail is captured — the handler comment flags this as a fraud vector.

Auth: required.
Request body:

```json
{ "work_type": "tiling", "percentage_rate": 20, "price_per_sqm": 125, "minimum_price": 5500 }
```

Response 200: `{ "pricing": { ... } }`
Errors: 400, 500.

---

### `POST /api/subcontractors/decide`

**HE:** האלגוריתם משווה בין שיטת תמחור אחוזית לבין תמחור למ"ר עבור כל קבלן פוטנציאלי, ובוחר את הטובה ביותר.
**EN:** Given a project (`project_value`, `area_sqm`, `work_type`) the algorithm computes cost for each available subcontractor under both pricing methods (percentage vs per-sqm), picks the cheaper method, then scores the candidates using weighted price/quality/reliability.

Auth: required.
Request body:

```json
{
  "work_type": "tiling",
  "project_value": 800000,
  "area_sqm": 320,
  "project_name": "בית ברמת השרון",
  "client_name": "משפחת כהן",
  "price_weight": 0.6,
  "quality_weight": 0.25,
  "reliability_weight": 0.15
}
```

Response 200: winner, candidates, savings, gross_profit, reasoning, `decision_id`.
Errors: 400 (no subs for work type, none available), 500.

---

## VAT / מע"מ

### `GET /api/vat/profile`

**HE:** פרופיל מס החברה (ח.פ, כתובת, סיווג). רשומה יחידה בטבלת `company_tax_profile`.
**EN:** Fetch the singleton company tax profile.

Auth: required.
Response 200: `{ "profile": { ... } | null }`

---

### `PUT /api/vat/profile`

**HE:** יצירה או עדכון של פרופיל המס.
**EN:** Upsert the tax profile. If a row exists it's updated; otherwise inserted.

Auth: required.
Request body: raw fields of `company_tax_profile` (`company_name`, `tax_id`, `vat_number`, `address`, ...).
Response 200: `{ "profile": { ... } }`
Errors: 400.

---

### `GET /api/vat/periods`

**HE:** רשימת תקופות מע"מ (ברירת מחדל — 24 אחרונות).
**EN:** List VAT periods, newest first. Optional `?limit=N`.

Auth: required.
Response 200: `{ "periods": [ ... ] }`

---

### `POST /api/vat/periods`

**HE:** פתיחת תקופת מע"מ חדשה (status = `open`).
**EN:** Open a new VAT period.

Auth: required.
Request body:

```json
{ "period_start": "2026-03-01", "period_end": "2026-03-31", "period_label": "2026-03" }
```

`period_label` is optional (defaults to `period_start.slice(0,7)`).
Response 201: `{ "period": { ... } }`
Errors: 400 (missing dates).

---

### `GET /api/vat/periods/:id`

**HE:** מחזיר את פרטי התקופה עם חישוב live של כל הטוטלים מחשבוניות המס. `is_refund=true` כשתחת-0.
**EN:** Returns the period row plus **computed totals** (taxable_sales, zero_rate_sales, exempt_sales, vat_on_sales, taxable_purchases, vat_on_purchases, asset_purchases, vat_on_assets, net_vat_payable, is_refund) aggregated live from `tax_invoices`.

Auth: required.
Response 200: `{ "period": {...}, "computed": {...}, "counts": { "outputs": 12, "inputs": 7 } }`
Errors: 404.

---

### `POST /api/vat/periods/:id/close`

**HE:** חישוב סופי של הטוטלים, עדכון התקופה לסטטוס `closing`. חוסם סגירה חוזרת.
**EN:** Compute totals, persist them, and move the period status to `closing`. Fails if period is not `open`.

Auth: required.
Response 200: `{ "period": { ... }, "totals": { ... } }`
Errors: 404, 409 (wrong status), 500.

---

### `POST /api/vat/periods/:id/submit`

**HE:** בונה קובץ PCN836, מאמת אותו, שומר לארכיון בדיסק, יוצר רשומת `vat_submissions`, מעדכן את התקופה לסטטוס `submitted`.
**EN:** Builds the PCN836 export file (via `buildPcn836File`), runs `validatePcn836File`, archives the file to `PCN836_ARCHIVE_DIR` (default `./data/pcn836`), inserts a `vat_submissions` row, and flips period status to `submitted`.

Auth: required.
Request body:

```json
{ "submission_type": "initial", "submission_method": "shamat", "submitted_by": "kobi" }
```

Response 201: `{ "submission": {...}, "metadata": {...}, "archivePath": "/data/pcn836/...", "preview": [ ... ] }`
Errors: 404, 409 (already submitted), 412 (profile missing), 422 (PCN836 validation errors), 500.

---

### `GET /api/vat/periods/:id/pcn836`

**HE:** הורדת קובץ PCN836 כ-stream בקידוד windows-1255 (לשליחה לשע"ם).
**EN:** Streams the archived PCN836 file back as `text/plain; charset=windows-1255` with a `.TXT` attachment name. Content is the literal bytes stored at submission time.

Auth: required.
Response 200: binary stream.
Errors: 404 (no file path), 410 (archive file missing from disk).

---

### `GET /api/vat/invoices`

**HE:** רשימת חשבוניות מס. תומך בפילטרים `direction` (input/output) ו-`period_id`.
**EN:** List tax invoices. Query params: `direction`, `period_id`, `limit` (default 100).

Auth: required.
Response 200: `{ "invoices": [ ... ] }`

---

### `POST /api/vat/invoices`

**HE:** קליטת חשבונית מס. אם לא סופק vat_amount המערכת מחשבת לפי `VAT_RATE` (ברירת מחדל 17%).
**EN:** Record a tax invoice. If `vat_amount` is not supplied and the invoice is neither exempt nor zero-rated, the server auto-computes `vat_amount` / `gross_amount` from `net_amount` using `VAT_RATE`.

Auth: required.
Request body (minimum):

```json
{
  "direction": "input",
  "invoice_number": "A-2026-001",
  "invoice_date": "2026-03-15",
  "counterparty_name": "ספק כלשהו",
  "counterparty_tax_id": "514123456",
  "net_amount": 1000,
  "vat_period_id": 12,
  "is_asset": false,
  "is_zero_rate": false,
  "is_exempt": false
}
```

Response 201: `{ "invoice": { ... } }`
Errors: 400.

---

## Annual Tax / מס שנתי

### `GET /api/projects`

**HE:** רשימת פרויקטים. פילטרים: `status`, `fiscal_year`.
**EN:** List projects. Optional query params `status`, `fiscal_year`.

Auth: required.
Response 200: `{ "projects": [ ... ] }`

---

### `POST /api/projects`

**HE:** יצירת פרויקט חדש.
**EN:** Create a project.

Auth: required.
Request body: raw `projects` row (`name`, `client_name`, `fiscal_year`, `status`, ...).
Response 201: `{ "project": { ... } }`
Errors: 400.

---

### `PATCH /api/projects/:id`

**HE:** עדכון חלקי של פרויקט.
**EN:** Partial update of a project with before/after audit capture.

Auth: required.
Response 200: `{ "project": { ... } }`
Errors: 400, 500.

---

### `GET /api/customers`

**HE:** רשימת לקוחות פעילים (active=true), ממוין לפי שם.
**EN:** List active customers sorted by name.

Auth: required.
Response 200: `{ "customers": [ ... ] }`

---

### `POST /api/customers`

**HE:** יצירת לקוח חדש.
**EN:** Create a customer row.

Auth: required.
Response 201: `{ "customer": { ... } }`
Errors: 400.

---

### `GET /api/customer-invoices`

**HE:** רשימת חשבוניות לקוח. פילטרים: `customer_id`, `project_id`, `status`, `limit`.
**EN:** List customer invoices with joined customer + project rows. Query params: `customer_id`, `project_id`, `status`, `limit` (default 100).

Auth: required.
Response 200: `{ "invoices": [ ... ] }`

---

### `POST /api/customer-invoices`

**HE:** הפקת חשבונית לקוח. vat_amount וגרוס מחושבים אוטומטית אם חסרים.
**EN:** Create a customer invoice. Auto-computes `vat_amount` and `gross_amount` when `vat_amount` missing but `net_amount` present. Sets `amount_outstanding` to gross.

Auth: required.
Request body:

```json
{
  "customer_id": 10,
  "customer_name": "יצחק קבלן",
  "project_id": 3,
  "invoice_number": "INV-2026-050",
  "invoice_date": "2026-04-01",
  "net_amount": 10000,
  "vat_rate": 0.17
}
```

Response 201: `{ "invoice": { ... } }`
Errors: 400.

---

### `GET /api/customer-payments`

**HE:** רשימת קבלות מלקוחות (100 אחרונות).
**EN:** List recent customer payments joined with the customer. `?limit=N` (default 100).

Auth: required.
Response 200: `{ "payments": [ ... ] }`

---

### `POST /api/customer-payments`

**HE:** רישום קבלה. אם מועבר `invoice_ids`, הסכום נפרש בין החשבוניות (FIFO) ומעדכן את `amount_outstanding`/`status` בכל אחת.
**EN:** Record a customer payment. If `invoice_ids` is an array, the amount is applied to each invoice in order (capped by each invoice's outstanding balance) and the invoice status is rolled to `paid`/`partial` accordingly.

Auth: required.
Request body:

```json
{
  "customer_id": 10,
  "customer_name": "יצחק קבלן",
  "amount": 10000,
  "payment_date": "2026-04-05",
  "receipt_number": "RCP-001",
  "invoice_ids": [55, 56]
}
```

Response 201: `{ "payment": { ... } }`
Errors: 400.

---

### `GET /api/fiscal-years`

**HE:** רשימת שנות מס.
**EN:** List fiscal year records, newest first.

Auth: required.
Response 200: `{ "fiscal_years": [ ... ] }`

---

### `POST /api/fiscal-years/:year/compute`

**HE:** חישוב מצרפי של שנת מס מסוימת: total_revenue, total_cogs, gross_profit, net_profit_before_tax. upsert בטבלת `fiscal_years`.
**EN:** Aggregates all customer invoices and input tax invoices for the given year, writes/updates the row in `fiscal_years`. Note: `net_profit_before_tax` in the current implementation equals `gross_profit` (only COGS is subtracted — opex is not yet modeled).

Auth: required.
Response 200: `{ "fiscal_year": { ... } }`
Errors: 400 (invalid year), 500.

```bash
curl -X POST -H "X-API-Key: $KEY" http://localhost:3100/api/fiscal-years/2026/compute
```

---

### `POST /api/annual-tax/:year/forms/:type/generate`

**HE:** יצירה/רענון של דוח מס שנתי. טיפוסים נתמכים: `1320`, `1301`, `6111`, `30a`. שומר upsert בטבלת `annual_tax_reports`.
**EN:** Generate/refresh one of the annual tax returns. Routes to `buildForm1320`, `buildForm1301`, `buildForm6111`, or `buildForm30A`. Uses 2026 corporate tax rate (23%) on `net_profit_before_tax`. Upserts into `annual_tax_reports`.

Auth: required.
Request body (varies by form — 1320/6111 mostly compute from DB; 1301 needs taxpayer/income/deductions; 30a needs production/materials/labor):

```json
{
  "taxpayer": { "id": "123456789", "first_name": "...", "last_name": "..." },
  "incomeSources": { ... },
  "deductions": { ... },
  "credits": { ... }
}
```

Response 200: `{ "report": { ... } }`
Errors: 400 (unknown form type / builder exception), 412 (profile or fiscal year not set up), 500.

```bash
curl -X POST -H "X-API-Key: $KEY" -H "Content-Type: application/json" \
  -d '{}' \
  http://localhost:3100/api/annual-tax/2026/forms/1320/generate
```

---

### `GET /api/annual-tax/:year/forms`

**HE:** רשימת כל הדוחות עבור שנה זו.
**EN:** List all `annual_tax_reports` rows for the given fiscal year.

Auth: required.
Response 200: `{ "reports": [ ... ] }`

---

## Bank Reconciliation / התאמות בנק

### `GET /api/bank/accounts`

**HE:** רשימת חשבונות בנק, החשבון הראשי ראשון.
**EN:** List bank accounts ordered with primary first.

Auth: required.
Response 200: `{ "accounts": [ ... ] }`

---

### `POST /api/bank/accounts`

**HE:** הוספת חשבון בנק חדש.
**EN:** Create a bank account.

Auth: required.
Request body (raw `bank_accounts` row — `bank_name`, `account_name`, `account_number`, `iban`, `currency`, `is_primary`, ...).
Response 201: `{ "account": { ... } }`
Errors: 400.

---

### `PATCH /api/bank/accounts/:id`

**HE:** עדכון חשבון בנק.
**EN:** Partial update with before/after audit.

Auth: required.
Response 200: `{ "account": { ... } }`
Errors: 400.

---

### `POST /api/bank/accounts/:id/import`

**HE:** ייבוא דפי חשבון. המערכת מזהה את הפורמט אוטומטית (`autoParse`), יוצרת רשומת `bank_statements`, מכניסה את כל התנועות לטבלת `bank_transactions`, מעדכנת את יתרת החשבון.
**EN:** Import a statement. Body requires `content` (raw statement text) and optionally `format` (forces a parser) and `openingBalance` override. `autoParse` detects format; parsed period + transactions are persisted.

Auth: required.
Request body:

```json
{
  "content": "<CSV/OFX/MT940/PDF text>",
  "format": "csv",
  "openingBalance": 0
}
```

Response 201: `{ "statement": {...}, "imported": N, "period": {...}, "openingBalance": 0, "closingBalance": 1234.56 }`
Errors: 400 (content missing), 422 (parse failure), 500 (DB insert failure).

---

### `GET /api/bank/transactions`

**HE:** רשימת תנועות בנק. פילטרים: `account_id`, `reconciled` (`true`/`false`), `limit` (ברירת מחדל 200).
**EN:** List bank transactions with filters.

Auth: required.
Response 200: `{ "transactions": [ ... ] }`

---

### `POST /api/bank/accounts/:id/auto-reconcile`

**HE:** מריץ את אלגוריתם ההתאמות — מעלה עד 500 תנועות לא-מותאמות ומציע התאמות מול חשבוניות לקוח פתוחות והזמנות רכש ששלחו. לא מבצע את ההתאמות — רק מציע.
**EN:** Runs `autoReconcileBatch` over up to 500 unreconciled transactions for this account. Candidate pools: open customer invoices (`status != paid/voided`) and sent purchase orders (`status = sent`). Returns **suggestions only** — it does NOT mutate `reconciled` or create match rows.

Auth: required.
Response 200:

```json
{
  "checked": 42,
  "suggestions": [ { "bank_transaction_id": 7, "target_type": "invoice", "target_id": 55, "confidence": 0.97 } ],
  "autoApproveThreshold": 0.95
}
```

---

### `POST /api/bank/matches`

**HE:** אישור התאמה ידני/אוטומטי. יוצר `reconciliation_matches` ומעדכן את `bank_transactions.reconciled=true`.
**EN:** Commit a reconciliation. Creates the match row (already approved), then updates the bank transaction with `reconciled=true` and copies `matched_to_type`/`matched_to_id` metadata.

Auth: required.
Request body:

```json
{
  "bank_transaction_id": 7,
  "target_type": "customer_invoice",
  "target_id": 55,
  "matched_amount": 10000,
  "confidence": 0.97,
  "match_type": "manual",
  "match_criteria": { "amount_delta": 0, "date_delta_days": 1 }
}
```

Response 201: `{ "match": { ... } }`
Errors: 400.

---

### `GET /api/bank/discrepancies`

**HE:** רשימת אי-התאמות פתוחות. פילטר `status`.
**EN:** List reconciliation discrepancies, optional `?status=open|resolved|...`.

Auth: required.
Response 200: `{ "discrepancies": [ ... ] }`

---

### `GET /api/bank/summary`

**HE:** סיכום מה-view `v_unreconciled_summary`.
**EN:** Dashboard summary from the `v_unreconciled_summary` view.

Auth: required.
Response 200: `{ "summary": [ ... ] }`

---

## Payroll / שכר

### `GET /api/payroll/employers`

**HE:** רשימת מעסיקים.
**EN:** List employer rows, sorted by legal name.

Auth: required.
Response 200: `{ "employers": [ ... ] }`

---

### `POST /api/payroll/employers`

**HE:** יצירת מעסיק חדש.
**EN:** Create an employer.

Auth: required.
Request body: raw `employers` row (`legal_name`, `tax_id`, `deductions_file_number`, ...).
Response 201: `{ "employer": { ... } }`
Errors: 400.

---

### `GET /api/payroll/employees`

**HE:** רשימת עובדים. פילטרים: `employer_id`, `active=true`.
**EN:** List employees, sorted by full name. Query params filter by employer and active status.

Auth: required.
Response 200: `{ "employees": [ ... ] }`

---

### `POST /api/payroll/employees`

**HE:** יצירת עובד חדש.
**EN:** Create an employee row.

Auth: required.
Request body: raw `employees` row (`first_name`, `last_name`, `id_number`, `employer_id`, `base_salary`, ...).
Response 201: `{ "employee": { ... } }`
Errors: 400.

---

### `PATCH /api/payroll/employees/:id`

**HE:** עדכון עובד.
**EN:** Partial update of an employee.

Auth: required.
Response 200: `{ "employee": { ... } }`
Errors: 400.

---

### `GET /api/payroll/wage-slips`

**HE:** רשימת תלושי שכר עם פילטרים: `employer_id`, `employee_id`, `period_year`, `period_month`, `status`.
**EN:** Query wage slips, newest period first. Supports `employer_id`, `employee_id`, `period_year`, `period_month`, `status`, `limit` (default 200).

Auth: required.
Response 200: `{ "wage_slips": [ ... ] }`

---

### `POST /api/payroll/wage-slips/compute`

**HE:** תצוגה מקדימה — מחשב תלוש שכר אך לא שומר אותו. טוען נתוני YTD מתלושים קודמים השנה ויתרות חופשה/מחלה.
**EN:** Preview only — computes a wage slip without persisting it. Loads prior-month slips for the same year to build the YTD totals, pulls current leave balances, and feeds everything into `computeWageSlip`.

Auth: required.
Request body:

```json
{
  "employee_id": 7,
  "period": { "year": 2026, "month": 3 },
  "timesheet": { "worked_days": 22, "worked_hours": 186, "overtime_125": 4, "overtime_150": 2 }
}
```

Response 200: `{ "wage_slip": { ... }, "preview": true }`
Errors: 400, 404 (employee/employer not found), 500.

---

### `POST /api/payroll/wage-slips`

**HE:** חישוב ושמירה של תלוש שכר. בודק שאין כבר תלוש קיים לתקופה הזו ומונע כפילויות.
**EN:** Compute + persist a wage slip. Rejects duplicates with HTTP 409 if an existing non-voided slip already exists for `employee_id`/`period_year`/`period_month`.

Auth: required.
Request body: same as `/compute` above.
Response 201: `{ "wage_slip": { ... } }`
Errors: 400, 404, 409 (duplicate — returns `existing_id`), 500.

---

### `GET /api/payroll/wage-slips/:id`

**HE:** פרטי תלוש שכר בודד.
**EN:** Fetch a single wage slip by id.

Auth: required.
Response 200: `{ "wage_slip": { ... } }`
Errors: 404.

---

### `POST /api/payroll/wage-slips/:id/approve`

**HE:** אישור תלוש שכר. מעבר מ-`computed`/`draft` → `approved`.
**EN:** Approve a slip. Fails with 409 unless current status is `computed` or `draft`.

Auth: required.
Response 200: `{ "wage_slip": { ... } }`
Errors: 404, 409.

---

### `POST /api/payroll/wage-slips/:id/issue`

**HE:** יוצר PDF של התלוש ומסמן `issued`.
**EN:** Generates the wage slip PDF via `generateWageSlipPdf`, writes it to `PAYROLL_PDF_DIR` (default `./storage/wage-slips`), and updates the DB with `pdf_path` + `pdf_generated_at` + `status=issued`. Slip must be in `approved` status.

Auth: required.
Response 200: `{ "wage_slip": { ... }, "pdf": { "path": "...", "size": 12345 } }`
Errors: 404, 409, 500.

---

### `GET /api/payroll/wage-slips/:id/pdf`

**HE:** הורדת ה-PDF של התלוש. אם הקובץ לא קיים עדיין בדיסק, נוצר און-דה-פליי.
**EN:** Streams the wage slip PDF as `application/pdf`. If the file is missing from disk the handler regenerates it on the fly.

Auth: required.
Response 200: binary stream.
Errors: 404, 500.

---

### `POST /api/payroll/wage-slips/:id/void`

**HE:** ביטול תלוש שכר. ההיסטוריה נשמרת ב-`notes` ובלוג payroll audit.
**EN:** Mark a slip voided. Appends a VOIDED note to `notes` with actor + reason. Dual audit log — both `audit_log` and `payroll_audit_log`.

Auth: required.
Request body: `{ "reason": "error in timesheet" }`
Response 200: `{ "wage_slip": { ... } }`
Errors: 404, 400.

---

### `GET /api/payroll/employees/:id/balances`

**HE:** יתרות העובד (חופשה, מחלה, קרן השתלמות, פיצויים) — סנפשוט אחרון.
**EN:** Latest employee balance snapshot.

Auth: required.
Response 200: `{ "balances": { ... } | null }`

---

### `POST /api/payroll/employees/:id/balances`

**HE:** upsert של סנפשוט יתרות חדש.
**EN:** Upsert a new balance snapshot (`snapshot_date` defaults to today).

Auth: required.
Request body: `{ "snapshot_date": "2026-04-01", "vacation_days_balance": 14, "sick_days_balance": 20, "study_fund_balance": 5000, "severance_balance": 12000 }`
Response 200: `{ "balances": { ... } }`
Errors: 400.

---

## Analytics / דוחות

### `GET /api/analytics/savings`

**HE:** סכום כולל של החיסכון מכל החלטות הרכש וקבלני המשנה.
**EN:** Aggregates `savings_amount` from `procurement_decisions` and `subcontractor_decisions`.

Auth: required.
Response 200:

```json
{
  "total_savings": 123456,
  "procurement": { "total": 80000, "decisions": 22 },
  "subcontractor": { "total": 43456, "decisions": 9 },
  "message": "💰 חיסכון כולל: ₪123,456"
}
```

---

### `GET /api/analytics/spend-by-supplier`

**HE:** הוצאה לפי ספק (רק ספקים עם הזמנות).
**EN:** List suppliers with `total_orders > 0`, sorted by `total_spent` desc.

Auth: required.
Response 200: `{ "suppliers": [ { "name": "...", "total_spent": 12345, "total_orders": 3, "overall_score": 87, "risk_score": 5 } ] }`

---

### `GET /api/analytics/spend-by-category`

**HE:** הוצאה מצטברת לפי קטגוריית `po_line_items`.
**EN:** Sum `po_line_items.total_price` grouped by category in-process.

Auth: required.
Response 200: `{ "categories": [ { "category": "cement", "total": 98765 } ] }`

---

## Audit Log / יומן ביקורת

### `GET /api/audit`

**HE:** רשומות יומן הביקורת (ברירת מחדל 50 אחרונות).
**EN:** Fetch audit log entries. `?limit=N` (default 50).

Auth: required.
Response 200: `{ "entries": [ ... ] }`

---

## Webhooks / Webhooks

### `GET /webhook/whatsapp`

**HE:** שלב האימות של WhatsApp Business. משווה את `hub.verify_token` ל-`WHATSAPP_VERIFY_TOKEN` ומחזיר את ה-challenge.
**EN:** Facebook WhatsApp Business verification handshake. Returns the `hub.challenge` when `hub.verify_token` matches `WHATSAPP_VERIFY_TOKEN`.

Auth: none (uses the verify token parameter).
Responses:

- 200 + challenge string (success)
- 403 (token mismatch)

---

### `POST /webhook/whatsapp`

**HE:** קליטת הודעות נכנסות מספקים (אחרי אימות HMAC SHA-256).
**EN:** Receives inbound WhatsApp Business messages after verifying the `X-Hub-Signature-256` HMAC using `WHATSAPP_APP_SECRET`. In production the server **refuses** unsigned webhooks (HTTP 500 if secret not configured). Incoming messages are logged to `system_events` with type `whatsapp_incoming`.

Auth: HMAC (not API key).
Rate limit: `/webhook/*` has its own pool — 120 req / 60 s by default (`RATE_LIMIT_WEBHOOK_MAX`).
Response: 200 (always, once HMAC passes).
Errors: 401 (bad/missing signature), 500 (secret not configured in production).

---

## Notes on quirks observed while reading the source

- **`POST /api/purchase-orders/:id/send` returns 502 on transmission failure** even though the PO row is still updated (to `send_failed`). This is a deliberate signal to clients — don't treat it as pure failure.
- **`POST /api/rfq/:id/decide` normalizes weights** — any subset of the four weights works; internally they're all clamped to [0,1] and summed-to-1. Passing all zeros yields 400.
- **`POST /api/vat/invoices` auto-fills VAT** only when `vat_amount` is missing AND the invoice is neither exempt nor zero-rated.
- **`POST /api/fiscal-years/:year/compute` treats net profit before tax = gross profit** — OpEx is not yet modelled, the handler subtracts only COGS.
- **`GET /api/vat/periods/:id/pcn836` returns 410 (not 404)** when the file is referenced by the DB but missing from disk — that's intentional to distinguish "never generated" from "archive purged".
- **VAT period status transitions are one-way locks:** `open` → `closing` → `submitted`. You cannot re-close or re-submit without DB surgery.
- **`POST /api/bank/accounts/:id/auto-reconcile` is read-only** — it suggests matches but does not commit. Use `POST /api/bank/matches` to actually reconcile.
- **`POST /api/payroll/wage-slips` enforces duplicate detection** against non-voided rows; voided slips for the same period are ignored (so you can re-issue after voiding).
- **Webhook HMAC** is enforced in production only; in dev it warns and passes through.
- **Rate limiting** uses two pools: `/api/*` (300 / 15min default) and `/webhook/*` (120 / 60s default). An additional in-memory `readLimiter` (`src/middleware/rate-limits`) is also mounted globally — 100 req/min per IP+API key. The `writeLimiter` (20/min) and `expensiveLimiter` (5/min) exist but are **not yet wired per route** (marked `TODO` in `server.js`).
- **Four public probes live outside `/api/`** — `GET /healthz`, `GET /livez`, `GET /readyz`, `GET /metrics`. They are not rate-limited by the `/api/*` pool and do not require an API key. `/readyz` actually hits Supabase so it's the only one that can return 503.
- **`/metrics`** is only registered if `src/ops/metrics` loads successfully at boot — otherwise the route silently does not exist.

---

*Last regenerated: 2026-04-11.*
