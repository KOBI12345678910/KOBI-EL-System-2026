# 🚀 ONYX PROCUREMENT — מדריך התקנה מהיר

## שלב 1: Supabase (2 דקות)

1. לך ל-supabase.com → הפרויקט שלך
2. לחץ **SQL Editor** בצד שמאל
3. העתק את כל התוכן של `001-supabase-schema.sql`
4. הדבק ולחץ **Run**
5. תקבל: "ONYX Database Schema created successfully!"

## שלב 2: הגדרות (1 דקה)

1. העתק `.env.example` ל-`.env`
2. מלא את הפרטים:
   - `SUPABASE_URL` — מתוך Settings → API בפרויקט Supabase
   - `SUPABASE_ANON_KEY` — מתוך Settings → API → anon/public
   - `WHATSAPP_TOKEN` — מתוך Meta Business Suite
   - `WHATSAPP_PHONE_ID` — מתוך WhatsApp Business API

## שלב 3: הרצה (1 דקה)

```bash
npm install
npm start
```

## שלב 4: בדיקה

פתח דפדפן: http://localhost:3100/api/status

צריך לראות:
```json
{
  "engine": "ONYX Procurement System",
  "status": "operational",
  "supabase": "connected"
}
```

## שלב 5: שימוש — תהליך רכש מלא

### 5.1 צור בקשת רכש:
```bash
curl -X POST http://localhost:3100/api/purchase-requests \
  -H "Content-Type: application/json" \
  -d '{
    "requested_by": "דימה",
    "urgency": "high",
    "project_name": "מעקות קריאתי 10",
    "items": [
      {"category": "ברזל", "name": "ברזל 12 מ\"מ", "quantity": 200, "unit": "מטר", "specs": "ST37"},
      {"category": "ברזל", "name": "פרופיל 40×40", "quantity": 100, "unit": "מטר"}
    ]
  }'
```

### 5.2 שלח RFQ לכל הספקים:
```bash
curl -X POST http://localhost:3100/api/rfq/send \
  -H "Content-Type: application/json" \
  -d '{
    "purchase_request_id": "ID_FROM_STEP_1",
    "response_window_hours": 24,
    "company_note": "מחיר אטרקטיבי — הזמנה גדולה"
  }'
```
→ כל הספקים שמוכרים ברזל יקבלו WhatsApp!

### 5.3 הזן הצעות מחיר שחוזרות:
```bash
curl -X POST http://localhost:3100/api/quotes \
  -H "Content-Type: application/json" \
  -d '{
    "rfq_id": "RFQ_ID",
    "supplier_id": "SUPPLIER_ID",
    "supplier_name": "מתכת מקס",
    "delivery_days": 3,
    "delivery_fee": 500,
    "line_items": [
      {"name": "ברזל 12 מ\"מ", "quantity": 200, "unit": "מטר", "unit_price": 45},
      {"name": "פרופיל 40×40", "quantity": 100, "unit": "מטר", "unit_price": 62}
    ]
  }'
```

### 5.4 AI מחליט:
```bash
curl -X POST http://localhost:3100/api/rfq/RFQ_ID/decide \
  -H "Content-Type: application/json" \
  -d '{"decided_by": "קובי"}'
```
→ AI משווה את כל ההצעות ובוחר את הטובה ביותר!

### 5.5 אשר ושלח לספק:
```bash
curl -X POST http://localhost:3100/api/purchase-orders/PO_ID/approve \
  -H "Content-Type: application/json" \
  -d '{"approved_by": "קובי"}'

curl -X POST http://localhost:3100/api/purchase-orders/PO_ID/send \
  -H "Content-Type: application/json" \
  -d '{"sent_by": "קובי"}'
```
→ הזמנת רכש נשלחת לספק ב-WhatsApp!

### 5.6 החלטת קבלן משנה:
```bash
curl -X POST http://localhost:3100/api/subcontractors/decide \
  -H "Content-Type: application/json" \
  -d '{
    "work_type": "מעקות_ברזל",
    "project_value": 120000,
    "area_sqm": 280,
    "project_name": "מעקות קריאתי 10",
    "client_name": "חברת כנען"
  }'
```
→ AI מחשב מה זול יותר: אחוזים או מ"ר!

## API Endpoints מלא:

| Method | URL | תיאור |
|--------|-----|--------|
| GET | /api/status | סטטוס מערכת |
| GET | /api/suppliers | כל הספקים |
| POST | /api/suppliers | הוסף ספק |
| GET | /api/suppliers/:id | פרטי ספק |
| POST | /api/purchase-requests | בקשת רכש |
| POST | /api/rfq/send | שלח RFQ לספקים |
| GET | /api/rfq/:id | סטטוס RFQ |
| POST | /api/quotes | הזן הצעת מחיר |
| POST | /api/rfq/:id/decide | AI מחליט |
| GET | /api/purchase-orders | הזמנות רכש |
| POST | /api/purchase-orders/:id/approve | אשר הזמנה |
| POST | /api/purchase-orders/:id/send | שלח לספק |
| GET | /api/subcontractors | קבלני משנה |
| POST | /api/subcontractors/decide | % vs מ"ר |
| GET | /api/analytics/savings | דוח חיסכון |
| GET | /api/audit | לוג פעולות |
