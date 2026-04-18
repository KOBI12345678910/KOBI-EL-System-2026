# QA AGENT #33 — CODE QUALITY METRICS
## דוח איכות קוד — server.js + onyx-dashboard.jsx

**תאריך:** 2026-04-11
**היקף:** ניתוח סטטי של איכות קוד בלבד
**קבצים:** `server.js` (934 LOC), `web/onyx-dashboard.jsx` (710 LOC)

---

## 1. LOC לכל קובץ

| קובץ | LOC | הערות |
|------|-----|-------|
| `server.js` | 934 | כולל `console.log` אמנותי של ~25 שורות בסוף |
| `web/onyx-dashboard.jsx` | 710 | ~82 שורות הן אובייקט `styles` ענק (lines 630-710) |
| **סה"כ** | **1,644** | שני קבצים מונוליתיים |

---

## 2. ספירת פונקציות לכל קובץ

### server.js
| סוג | כמות | שמות |
|-----|------|------|
| פונקציות עזר (helpers) | 3 | `sendWhatsApp`, `sendSMS`, `audit` |
| Express handlers (`app.X`) | 28 | ראו רשימה למטה |
| Callbacks ב-`listen()` | 1 | arrow ב-`app.listen` |
| **סה"כ פונקציות** | **32** | |

רשימת ה-28 handlers (lines 111-901):
- 15 GET: `/api/status`, `/api/suppliers`, `/api/suppliers/:id`, `/api/suppliers/search/:category`, `/api/purchase-requests`, `/api/rfq/:id`, `/api/rfqs`, `/api/purchase-orders`, `/api/purchase-orders/:id`, `/api/subcontractors`, `/api/analytics/savings`, `/api/analytics/spend-by-supplier`, `/api/analytics/spend-by-category`, `/api/audit`, `/webhook/whatsapp`
- 11 POST: `/api/suppliers`, `/api/suppliers/:id/products`, `/api/purchase-requests`, `/api/rfq/send`, `/api/quotes`, `/api/rfq/:id/decide`, `/api/purchase-orders/:id/approve`, `/api/purchase-orders/:id/send`, `/api/subcontractors`, `/api/subcontractors/decide`, `/webhook/whatsapp`
- 1 PATCH: `/api/suppliers/:id`
- 1 PUT: `/api/subcontractors/:id/pricing`

### onyx-dashboard.jsx
| סוג | כמות | שמות |
|-----|------|------|
| API helper | 1 | `api` (async) |
| Main component | 1 | `OnyxDashboard` (default export) |
| Tab components | 7 | `DashboardTab`, `SuppliersTab`, `RFQTab`, `QuotesTab`, `OrdersTab`, `SubcontractorsTab`, `SubDecideTab` |
| UI sub-components | 4 | `KPI`, `Input`, `Select`, `MiniStat` |
| **סה"כ פונקציות** | **13** | |

---

## 3. אורך ממוצע של פונקציה

| קובץ | סה"כ שורות קוד | # פונקציות | ממוצע |
|------|----------------|------------|-------|
| `server.js` (ללא header+listen) | ~900 | 32 | **~28 שורות** |
| `onyx-dashboard.jsx` (ללא styles) | ~625 | 13 | **~48 שורות** |

**מסקנה:** הקומפוננטות ב-JSX ארוכות באופן חריג (כפליים מהממוצע העולמי לפונקציית React ~20-25).

---

## 4. הפונקציה הארוכה ביותר

### קריטי: `POST /api/rfq/:id/decide` — 168 שורות
- **מיקום:** `server.js:425-593`
- **אחריות:** האנדלר מבצע 7 משימות בתוך פונקציה אחת:
  1. טעינת הצעות (`quotes`)
  2. טעינת ספקים (`suppliers`)
  3. חישוב scoring (price/delivery/rating/reliability)
  4. בניית `reasoning` (array טקסטואלי)
  5. יצירת Purchase Order
  6. העתקת `line_items` ל-PO
  7. שמירת `procurement_decision` + עדכון סטטוס RFQ + עדכון ספק
- **בעיה:** 7 אחריויות = SRP violation חמור. צריך להתפצל ל-`scoreQuotes`, `buildReasoning`, `createPO`, `savedDecision`.

### שני במקום: `POST /api/rfq/send` — 119 שורות (226-344)
- שולח RFQ לכל הספקים. בתוכו: loop יצירת מסרים, שליחת WhatsApp/SMS, רישום recipients, יצירת system_events.
- **בעיה:** ה-loop בשורה 289 מכיל try/catch בודד (היחיד בכל ה-server.js!).

### שלישי במקום: `POST /api/subcontractors/decide` — 86 שורות (712-798)
- חישוב קבלן משנה (% vs מ"ר). דומה מבנית ל-`/api/rfq/:id/decide` → **קוד מועתק כמעט מילולית**.

### JSX:
- `QuotesTab` — 98 שורות (337-435)
- `RFQTab` — 88 שורות (243-331)
- `OrdersTab` — 43 שורות (442-485)

---

## 5. נקודות Cyclomatic Complexity חמות

| handler | # `if` | # `await supabase` | # ternary `? :` | ציון משוער |
|---------|--------|-------------------|----------------|-------------|
| `POST /api/rfq/:id/decide` | ~8 | 8 | ~10 | **~20** (High) |
| `POST /api/rfq/send` | ~7 | 6 | ~6 | **~16** (High) |
| `POST /api/subcontractors/decide` | ~5 | 3 | ~5 | **~11** (Medium) |
| `POST /api/quotes` | 3 | 5 | ~3 | **~8** (Medium) |

**סה"כ server.js:** 50 היקרויות של `if`/`else`/`? `. רוב ה-handlers פשוטים (2-4 if), אבל 3 ההנדלרים הגדולים מרוכזים סביב 80% מהמורכבות.

---

## 6. כפילויות קוד (Code Duplication)

### דפוס 1: `supabase...insert...select().single()` + `if (error) return res.status(400)`
חזרה של **8** היקרויות של `error: error.message` זהות (שורות 135, 151, 160, 168, 201, 388, 694, 707). זהו boilerplate שניתן להוציא ל-middleware או לפונקציית עזר:
```js
const handleError = (res, err, code=400) => res.status(code).json({error: err.message});
```

### דפוס 2: `Map(...).forEach + Array.from(Map.values())` — unique suppliers
מופיע **פעמיים כמעט זהה** (שורות 180-184 ב-`/api/suppliers/search/:category` ו-244-248 ב-`/api/rfq/send`).

### דפוס 3: חישוב `savingsAmount + savingsPercent`
**שלוש** היקרויות כמעט זהות:
- `/api/rfq/:id/decide` (503-504)
- `/api/subcontractors/decide` (759-760)
- ניתן להוציא ל-`calcSavings(high, low)`.

### דפוס 4: `reasoning` array builder
`/api/rfq/:id/decide` (507-521) ו-`/api/subcontractors/decide` (764-778) — **שני reasoning builders כמעט זהים**. אפשר `buildReasoning(type, data)`.

### דפוס 5: בניית `itemsList` עם `.map + .join('\n')`
**3 היקרויות** (258-260, 632-634, + הודעות RFQ/PO). ניתן לשתף templater.

### דפוס 6: הגדרת `weights` dict
שורות 430-435 ו-715-717 — שניהם weighted scoring.

**חומרה:** ~15-20% מקוד ה-server.js הוא כפילות מבנית.

---

## 7. מספרי קסם (Magic Numbers) וטקסטי קסם

### server.js — Magic Numbers
| ערך | מיקום | משמעות | פתרון |
|-----|-------|--------|-------|
| `0.18` | 377 | VAT | `const VAT_RATE = 0.18` |
| `3600000` | 255 | ms per hour | `HOUR_MS` |
| `86400000` | 533 | ms per day | `DAY_MS` |
| `50` | 143, 853 | מגבלת rows | `DEFAULT_LIMIT` |
| `24` | 255, 283 | default RFQ hours | `DEFAULT_RFQ_HOURS` |
| `0.50, 0.15, 0.20, 0.15` | 431-434 | משקלות scoring | `DEFAULT_WEIGHTS` const |
| `0.6, 0.25, 0.15` | 715-717 | משקלות subcontractor | נפרד מהקודם! |
| `100` | 465-468 | נורמליזציה ל-score | קבוע מיוחד |
| `3100` | 908 | PORT fallback | `DEFAULT_PORT` |
| `10` | 467-468 | rating multiplier | `RATING_SCALE` |

**סה"כ:** ~12-15 מספרי קסם ב-server.js.

### server.js — Magic Strings
- Statuses הארדקודדו (`'draft'`, `'approved'`, `'sent'`, `'confirmed'`, `'delivered'`, `'closed'`, `'cancelled'`, `'rfq_sent'`, `'decided'`) — אין enum. **9 ערכים** מפוזרים.
- Table names (`'suppliers'`, `'rfqs'`, `'purchase_orders'`, `'po_line_items'`, `'subcontractors'`, ...) — חזרות רבות. אין אובייקט `TABLES`.
- Channel names (`'whatsapp'`, `'sms'`) — 5 היקרויות.
- עברית מפוזרת: `'ספק חדש'`, `'בקשת רכש'`, `'אין קבלנים זמינים'` — 20+ מחרוזות UI מקובצות בקוד בלי i18n.

### onyx-dashboard.jsx — Magic Numbers/Strings
| ערך | משמעות |
|-----|--------|
| `"http://localhost:3100"` (line 3) | API URL hardcoded! ⚠️ |
| `30000` (line 45) | polling interval 30s |
| `4000` (line 31) | toast timeout |
| `5` (line 151) | recent orders slice |
| `200`, `100` (בצד server, לוגים) | truncation |
| צבעים: `"#dc2626"`, `"#059669"`, `"#f59e0b"`, ... | ~30 צבעים הארדקודדו בבתוך styles ולא theme tokens |

---

## 8. Dead Code / פונקציות לא בשימוש

### server.js
- **`sendSMS`** (71-93): קיים, אבל ה-trigger היחיד הוא ב-`/api/rfq/send` שורה 297 תחת תנאי `channel === 'sms'`. שדה `preferred_channel` בטבלת `suppliers` יכול להיות `'sms'`, אך אין ראיה שמישהו באמת מגדיר כך. ⚠️ **חצי-dead** — קיים אבל לא בדוק.
- **`app.get('/webhook/whatsapp')` verification** (863): פועל רק ברגע הרישום הראשוני אצל Meta. אחרי ההרשמה הראשונית — dead לכל מטרה מעשית.
- **`/api/analytics/spend-by-supplier`** (825) ו-**`/api/analytics/spend-by-category`** (834): קיימים אבל ה-UI (onyx-dashboard.jsx) **לא קורא להם**. ⚠️ **dead endpoints**. ה-JSX קורא רק ל-`/api/analytics/savings`.
- **`/api/suppliers/search/:category`** (173): אין קריאה מה-frontend.
- **`/api/rfqs`** (355): כן בשימוש (דרך `refresh()`).
- **`/api/suppliers/:id`** (140): אין קריאה מה-frontend.
- **`/api/purchase-orders/:id`** (608): אין קריאה מה-frontend.
- **`/api/audit`** (852): אין קריאה מה-frontend.

**סיכום:** לפחות **5 endpoints** מוגדרים ב-server.js אבל ה-frontend לא משתמש בהם. אפשר להסירם או לבנות UI שיצרוך אותם.

### onyx-dashboard.jsx
- ה-import של `useEffect, useCallback` שלם (line 1). הכול בשימוש.
- אין dead code בולט.

---

## 9. TODO / FIXME / HACK

**תוצאת Grep:** **אפס** הערות `TODO`, `FIXME`, `HACK`, `XXX` בשני הקבצים. ✅

(יש 3 היקרויות במסמכי QA אחרים בתיקייה, לא רלוונטי.)

---

## 10. עקביות שמות (עברית/אנגלית)

### ה-code identifiers כולם באנגלית ✅
כל השמות של משתנים/פונקציות/שדות: `sendWhatsApp`, `supplierMap`, `weightedScore`, `priceRange`, `deliveryFee`, `workTypes`, `addItem`, `submitQuote`...

### עברית מופיעה רק ב:
1. **string literals של הודעות UI** (`'שם ספק'`, `'ספק חדש'`, `'נא לציין'`)
2. **הערות** (`// ═══ SUPPLIERS — ספקים ═══`)
3. **Enum/category values בעברית!** ⚠️ זה בעייתי:
   - `categories = ["ברזל", "אלומיניום", "נירוסטה", ...]` (JSX line 253)
   - `workTypes = ["מעקות_ברזל", "מעקות_אלומיניום", ...]` (JSX 527)
   - ה-API מצפה לערכים עבריים! `eq('work_type', work_type)` שולח עברית ל-Supabase.
   - **סיכון:** אם ה-DB collation לא תומך, או אם שם `'מעקות_ברזל'` ישתנה — שבר.

### חוסר עקביות קטן:
- תערובת `snake_case` (שדות DB: `total_price`, `created_at`) עם `camelCase` (state משתנים: `totalPrice`, `deliveryFee`, `lineItems`) — הגיוני לפי context, אבל לעיתים מתחלף באותה פונקציה (line 369: `lineItems` → line 374: subtotal משתמש בו).
- בשורה 30: `setToast({ msg, type })` — משתמש `msg` (קיצור), בשאר הקוד `message`.

---

## 11. ES Modules vs CommonJS — האם עקבי?

| קובץ | שיטה | הוכחה |
|------|------|-------|
| `server.js` | **CommonJS** | `require('express')`, `require('@supabase/supabase-js')`, `require('https')`, `require('dotenv').config()` |
| `onyx-dashboard.jsx` | **ES Modules** | `import { useState, useEffect, useCallback } from "react"`, `export default function` |

**מצב:** **לא עקבי בין הקבצים**, אבל זה לגיטימי כאשר:
- `server.js` = Node.js backend (CJS עדיין שכיח)
- `onyx-dashboard.jsx` = React frontend (ESM סטנדרטי)

**המלצה:** להעביר את `server.js` ל-ESM (`import express from 'express'`) כי:
- `package.json` של הפרויקט צריך `type: "module"` כדי לתמוך בשני הצדדים
- Node 20+ תומך נטיב ב-ESM
- עקביות על פני כל הפרויקט

---

## 12. async/await vs .then — האם עקבי?

**תוצאת Grep:** **0** `.then()` בשני הקבצים. ✅

כל הקוד באסינכרוניות `async/await`. זה **עקבי מעולה**.

**אזהרה אחת:** בשורה 45 ב-JSX, `Promise.all([...])` — זו טכניקה נכונה ולא צריכה `.then()`. אמנם לא עטופה ב-`try/catch` (ראה סעיף 13).

---

## 13. דפוס טיפול בשגיאות — האם עקבי?

### ב-server.js — **לא עקבי, ומסוכן.**

| דפוס | מיקומים |
|------|---------|
| `try { ... } catch { ... }` | **2 בלבד** (שורות 59-62 בתוך Promise callback, 294-302 ב-loop של RFQ) |
| `if (error) return res.status(X)` אחרי destructure | **8 היקרויות** (135, 151, 160, 168, 201, 388, 694, 707) |
| **אין טיפול כלל** | **20 הנדלרים** — אם Supabase יזרוק, ה-process יקרוס! |

**דוגמה לבעיה (line 213):**
```js
app.get('/api/purchase-requests', async (req, res) => {
  const { data } = await supabase
    .from('purchase_requests')
    .select('*, purchase_request_items(*)')
    .order('created_at', { ascending: false });
  res.json({ requests: data });
});
```
אין `error` destructured. אין try/catch. אם `supabase` יזרוק → **unhandled promise rejection**.

**המלצה:** Express middleware אחד כללי:
```js
const asyncHandler = fn => (req,res,next) => Promise.resolve(fn(req,res,next)).catch(next);
// + error-handling middleware בסוף
```

### ב-onyx-dashboard.jsx — **עקבי אך שטחי.**
- פונקציית `api()` (line 6) עטופה ב-`try/catch` יחיד. כל שגיאה → `{ error: e.message }`.
- כל ה-callers בודקים `if (res.error)` ומראים toast.
- **בעיה:** ב-`refresh` (line 34) אין הגנה — אם `api()` יחזיר `undefined`, ה-`Promise.all` יזרוק. בפועל לא יזרוק כי `api()` תמיד מחזיר אובייקט, אבל זה hack.

---

## 14. פיצול המלצות (Module Split)

### server.js (934 שורות) — חייב להתפצל ל-Express Router pattern:

```
server.js  (~80 שורות — bootstrapping, config, listen)
├── lib/
│   ├── supabase.js      (client init)
│   ├── whatsapp.js      (sendWhatsApp, sendSMS, webhook parsing)
│   ├── audit.js         (audit function)
│   ├── errors.js        (asyncHandler, handleError)
│   └── constants.js     (VAT_RATE, DAY_MS, DEFAULT_WEIGHTS, TABLES, STATUSES)
└── routes/
    ├── status.js        (/api/status)
    ├── suppliers.js     (6 routes — 129 שורות)
    ├── purchase-requests.js  (2 routes — 30 שורות)
    ├── rfq.js           (4 routes — 200 שורות כולל decide)
    │                    ↓ ה-decide הגדול להתפצל בתוך:
    │                    lib/scoring.js (scoreQuotes, buildReasoning)
    ├── quotes.js        (1 route — 54 שורות)
    ├── purchase-orders.js (4 routes — 95 שורות)
    ├── subcontractors.js (4 routes — 115 שורות)
    │                    ↓ ה-decide הגדול להתפצל:
    │                    lib/subcontractor-scoring.js
    ├── analytics.js     (3 routes — 45 שורות)
    ├── audit.js         (1 route — 7 שורות)
    └── webhook.js       (2 routes — 42 שורות)
```

**יעד מומלץ:** 12 קבצים × ~80-150 שורות כל אחד = הרבה יותר ניתן לתחזוקה.

### onyx-dashboard.jsx (710 שורות) — פיצול דחוף:

```
web/
├── OnyxDashboard.jsx        (~80 שורות — layout, header, nav, toast)
├── api.js                    (~15 שורות — api helper)
├── styles.js                 (~82 שורות — מהשורות 630-710 הקיימות)
├── hooks/
│   └── useRefresh.js         (~15 שורות — לוגיקת polling)
└── tabs/
    ├── DashboardTab.jsx      (~55 שורות)
    ├── SuppliersTab.jsx      (~55 שורות)
    ├── RFQTab.jsx            (~90 שורות)
    ├── QuotesTab.jsx         (~100 שורות)
    ├── OrdersTab.jsx         (~45 שורות)
    ├── SubcontractorsTab.jsx (~30 שורות)
    └── SubDecideTab.jsx      (~70 שורות)
└── ui/
    ├── KPI.jsx
    ├── Input.jsx
    ├── Select.jsx
    └── MiniStat.jsx
```

---

## מסקנה כללית (Quality Score)

| קריטריון | ציון |
|----------|-----|
| Modularity | **3/10** — מונוליתי לחלוטין |
| Error Handling | **4/10** — לא עקבי, 20 handlers ללא הגנה |
| Naming | **8/10** — עקבי באנגלית, למעט enum בעברית |
| DRY | **5/10** — כפילויות מבניות משמעותיות |
| Magic Numbers | **4/10** — ~15 מספרי קסם |
| Dead Code | **7/10** — רק 5 endpoints לא-מחוברים |
| async consistency | **10/10** — אין `.then` כלל |
| Module system | **6/10** — CJS ב-backend, ESM ב-frontend (לא קטלני) |
| TODO hygiene | **10/10** — אפס TODO |
| **ציון כולל** | **~57/100** |

### 3 המלצות הדחופות ביותר

1. **פיצול `/api/rfq/:id/decide`** — 168 שורות הן בלתי-מתחזקות. להוציא scoring + PO creation + decision save ל-3 מודולים נפרדים.
2. **Global `asyncHandler` + error middleware** — 20 handlers כרגע יפילו את ה-process באירוע Supabase outage. תיקון של 5 שורות, הצלה של uptime.
3. **Extract constants** — `constants.js` עם `VAT_RATE`, `DAY_MS`, `DEFAULT_WEIGHTS`, `STATUSES`, `TABLES`. להסיר ~15 magic numbers ו-9 status strings.

---

*נבדק על ידי QA Agent #33 — ניתוח סטטי בלבד (ללא הרצה)*
