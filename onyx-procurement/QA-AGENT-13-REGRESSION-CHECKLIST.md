# QA Agent 13 — רשימת רגרסיה קנונית (ONYX Procurement)

**תאריך:** 2026-04-11
**היקף:** `onyx-procurement/` — Express server + React dashboard + Supabase
**מטרה:** רשימת תסריטים שחייבים להמשיך לעבוד אחרי **כל** שינוי קוד. "Definition of Done" לכל PR עתידי.
**שיטה:** Static analysis בלבד. אין מגע בקבצים.

## איך להשתמש במסמך

1. לפני merge של PR — עבור על כל הרשימה. כל פריט חייב PASS או סימן `(חריג מתועד)`.
2. כל פריט כולל: **תנאי מקדים**, **צעדים**, **תוצאה צפויה**, **איך לוודא** (SQL / curl / לחיצה).
3. תסריטים עם **★** הם חסמים קריטיים — אסור merge בלעדיהם.
4. באגים ידועים מסומנים `[BUG: F-XX]` — עד תיקון הם חריגים רשמיים, לא regressions חדשים.

ברירות מחדל:
- `API_BASE=http://localhost:3100`
- Supabase SQL Editor = "SQL"
- Dashboard = React app על `localhost:5173` (או כל פורט web)
- מטבע ברירת מחדל: ₪ (ILS)

---

## קטגוריה 1 — שלמות נתונים (Data Integrity)

### 1. ★ ספירת ספקים מדויקת אחרי seed
- **תנאי מקדים:** מיגרציה 001 + 002 רצו בהצלחה על DB נקי.
- **צעדים:** הרץ SELECT count על טבלת suppliers.
- **תוצאה צפויה:** 13 שורות בדיוק.
- **איך לוודא:** SQL: `SELECT COUNT(*) FROM suppliers;` — חייב להחזיר 13.

### 2. ★ ספירת מוצרים אחרי seed
- **תנאי מקדים:** 002-seed רץ.
- **צעדים:** ספור את טבלת `supplier_products`.
- **תוצאה צפויה:** ≥ 100 שורות (לפי התכנון: "100+ products"). במקרה של decrease — חשוד ל-regression.
- **איך לוודא:** SQL: `SELECT COUNT(*) FROM supplier_products;` — חייב להיות ≥ 100.

### 3. ★ ספירת קבלני משנה
- **תנאי מקדים:** 002-seed רץ.
- **צעדים:** ספור subcontractors.
- **תוצאה צפויה:** 8 שורות בדיוק.
- **איך לוודא:** SQL: `SELECT COUNT(*) FROM subcontractors;` — חייב להחזיר 8.

### 4. ★ ספירת שורות מחירון קבלנים
- **תנאי מקדים:** 002-seed רץ.
- **צעדים:** ספור `subcontractor_pricing`.
- **תוצאה צפויה:** 18 שורות לפחות (סכום ה-VALUES בכל 8 הקבלנים).
- **איך לוודא:** SQL: `SELECT COUNT(*) FROM subcontractor_pricing;` — חייב ≥ 18.

### 5. אין ספקים לא פעילים לאחר seed טרי
- **תנאי מקדים:** DB אחרי 002-seed, ללא שינויים ידניים.
- **צעדים:** ספור ספקים עם `active=false`.
- **תוצאה צפויה:** 0.
- **איך לוודא:** SQL: `SELECT COUNT(*) FROM suppliers WHERE active = false;` = 0.

### 6. אינוריאנט: כל מוצר שייך לספק קיים (FK)
- **תנאי מקדים:** 002-seed רץ.
- **צעדים:** LEFT JOIN supplier_products → suppliers ובדוק NULLs.
- **תוצאה צפויה:** 0 שורות יתומות.
- **איך לוודא:** SQL: `SELECT COUNT(*) FROM supplier_products sp LEFT JOIN suppliers s ON s.id=sp.supplier_id WHERE s.id IS NULL;` = 0.

### 7. אינוריאנט: כל overall_score בין 0 ל-100
- **תנאי מקדים:** seed.
- **צעדים:** בדוק גבולות.
- **תוצאה צפויה:** כל הערכים 0..100.
- **איך לוודא:** SQL: `SELECT COUNT(*) FROM suppliers WHERE overall_score < 0 OR overall_score > 100;` = 0.

### 8. אינוריאנט: rating, quality_score, delivery_reliability בין 1 ל-10
- **תנאי מקדים:** seed.
- **צעדים:** CHECK constraints מה-schema חייבים להחזיק.
- **תוצאה צפויה:** 0 חריגות.
- **איך לוודא:** SQL: `SELECT COUNT(*) FROM suppliers WHERE rating < 1 OR rating > 10 OR quality_score < 1 OR quality_score > 10 OR delivery_reliability < 1 OR delivery_reliability > 10;` = 0.

### 9. תגיות (tags) הן מערך לא-null
- **תנאי מקדים:** seed.
- **צעדים:** בדוק שאין NULL ב-tags.
- **תוצאה צפויה:** כולם הם ARRAY (לפחות ריק).
- **איך לוודא:** SQL: `SELECT COUNT(*) FROM suppliers WHERE tags IS NULL;` = 0.

### 10. Views קיימים ואינם נשברים
- **תנאי מקדים:** 001 רץ.
- **צעדים:** בצע SELECT מכל אחד משלושת ה-views.
- **תוצאה צפויה:** `procurement_dashboard`, `supplier_dashboard`, `rfq_summary` כולם מחזירים בלי שגיאה.
- **איך לוודא:** SQL: `SELECT * FROM procurement_dashboard;` + `SELECT COUNT(*) FROM supplier_dashboard;` + `SELECT COUNT(*) FROM rfq_summary;` — אף אחד לא זורק.

---

## קטגוריה 2 — זרימות קריטיות (Critical Flows)

### 11. ★ זרימה 1 — Dashboard tab נטען בהצלחה
- **תנאי מקדים:** שרת + DB חיים. ספקים קיימים.
- **צעדים:** פתח dashboard, לחץ על Tab "דשבורד".
- **תוצאה צפויה:** 4 כרטיסי KPI מופיעים, סעיף "פירוט חיסכון" מופיע, רשימת "הזמנות אחרונות" טעונה או empty state תקני.
- **איך לוודא:** UI: לחץ tab → צפה ב-KPI. curl: `GET /api/status`, `GET /api/suppliers`, `GET /api/analytics/savings` — 200.

### 12. ★ זרימה 2 — Suppliers tab + הוספת ספק חדש
- **תנאי מקדים:** שרת חי.
- **צעדים:** לחץ Tab "ספקים" → "+ הוסף ספק" → מלא שם+טלפון → שמור.
- **תוצאה צפויה:** Toast ירוק, הספק נוסף לרשימה, count עולה ב-1.
- **איך לוודא:** `curl -X POST /api/suppliers -d '{"name":"טסט","contact_person":"א","phone":"+972500000000"}'` חייב להחזיר 201 + supplier.id.

### 13. ★ זרימה 3 — RFQ send flow
- **תנאי מקדים:** ספקים קיימים עם מוצרים בקטגוריה "ברזל".
- **צעדים:** Tab "בקשת מחיר" → מלא פריט 1 (קטגוריה=ברזל, כמות=10) → שלח.
- **תוצאה צפויה:** 201, `suppliers_contacted ≥ 1`, RFQ שורה חדשה, PR משתנה ל-`rfq_sent`, audit row נכתב.
- **איך לוודא:** `curl -X POST /api/purchase-requests` → `POST /api/rfq/send` → בדוק `SELECT status FROM purchase_requests ORDER BY created_at DESC LIMIT 1;` = `rfq_sent`.

### 14. ★ זרימה 4 — Quotes tab + הזנת הצעה ידנית
- **תנאי מקדים:** RFQ פתוח קיים.
- **צעדים:** Tab "הצעות" → בחר RFQ → מלא הצעה (ספק + שורה) → שמור.
- **תוצאה צפויה:** הצעה נשמרת, `rfq_recipients.status` של הספק עולה ל-`quoted`, price_history מקבל רשומה.
- **איך לוודא:** SQL: `SELECT status FROM rfq_recipients WHERE rfq_id=<id> AND supplier_id=<sup>;` = `quoted`.

### 15. ★ זרימה 5 — AI decision (decide endpoint)
- **תנאי מקדים:** RFQ עם לפחות 2 הצעות.
- **צעדים:** לחץ "AI — בחר את ההצעה הטובה ביותר".
- **תוצאה צפויה:** מוחזר winner + savings + reasoning, PO נוצר ב-status=`draft`, `procurement_decisions` מקבל שורה, RFQ עובר ל-`decided`.
- **איך לוודא:** `curl -X POST /api/rfq/:id/decide` → בדוק `SELECT status FROM rfqs WHERE id=:id;` = `decided` + `SELECT COUNT(*) FROM purchase_orders WHERE rfq_id=:id;` ≥ 1.

### 16. ★ זרימה 6 — Orders tab + אישור + שליחה
- **תנאי מקדים:** PO ב-status `draft`.
- **צעדים:** Tab "הזמנות" → לחץ "✅ אשר".
- **תוצאה צפויה:** status עובר ל-`approved`, `approved_by` וה-`approved_at` מלאים, audit נכתב.
- **איך לוודא:** SQL: `SELECT status, approved_by FROM purchase_orders WHERE id=:id;`.

### 17. ★ זרימה 7 — Subcontractors tab רינדור
- **תנאי מקדים:** 002-seed רץ.
- **צעדים:** Tab "קבלנים".
- **תוצאה צפויה:** 8 כרטיסים, כל אחד עם השם, מומחיות, quality/reliability rating, ושורות מחירון.
- **איך לוודא:** UI: ספור 8 כרטיסים. curl: `GET /api/subcontractors` → `subcontractors.length = 8`.

### 18. ★ זרימה 8 — Subcontractor decide (% vs מ"ר)
- **תנאי מקדים:** 8 קבלנים עם מחירון.
- **צעדים:** Tab "החלטת קבלן" → work_type=מעקות_ברזל, project_value=120000, area_sqm=280 → חשב.
- **תוצאה צפויה:** מוחזר winner, candidates, reasoning, חיסכון חיובי, `subcontractor_decisions` מקבל שורה.
- **איך לוודא:** `curl -X POST /api/subcontractors/decide -d '{"work_type":"מעקות_ברזל","project_value":120000,"area_sqm":280}'` → 200 + winner name.

### 19. RFQ בלי הצעות → החלטה נדחית עם 400
- **תנאי מקדים:** RFQ חדש ללא הצעות.
- **צעדים:** קרא ל-decide.
- **תוצאה צפויה:** 400 + `error: "אין הצעות מחיר — לא ניתן לקבל החלטה"`.
- **איך לוודא:** `curl -X POST /api/rfq/:id/decide` → status=400.

### 20. RFQ send לקטגוריה ללא ספקים → 400
- **תנאי מקדים:** קטגוריה שאין לה ספקים (למשל `בלה-בלה`).
- **צעדים:** PR עם item בקטגוריה זו → RFQ send.
- **תוצאה צפויה:** 400 + `error` בעברית "לא נמצאו ספקים".
- **איך לוודא:** `curl ...` → status=400, body.error מכיל "לא נמצאו ספקים".

---

## קטגוריה 3 — Backward Compatibility

### 21. ★ Schema של supplier — שדות חובה נשמרים
- **תנאי מקדים:** שינוי קוד אחרון לא משנה schema.
- **צעדים:** בדוק `information_schema.columns` לטבלת suppliers.
- **תוצאה צפויה:** כל השדות הבאים קיימים: `id, name, contact_person, phone, email, whatsapp, preferred_channel, rating, quality_score, delivery_reliability, overall_score, risk_score, active, total_orders, total_spent, created_at, updated_at`.
- **איך לוודא:** SQL: `SELECT column_name FROM information_schema.columns WHERE table_name='suppliers';` — הרשימה חייבת להכיל את כולם.

### 22. ★ API response shape — /api/suppliers
- **תנאי מקדים:** קריאה ל-endpoint.
- **צעדים:** `GET /api/suppliers`.
- **תוצאה צפויה:** JSON מכיל `suppliers` (מערך), כל פריט עם `id, name, overall_score, product_count, open_orders`.
- **איך לוודא:** `curl /api/suppliers | jq '.suppliers[0] | keys'`.

### 23. ★ API response shape — /api/status
- **תנאי מקדים:** שרת חי.
- **צעדים:** `GET /api/status`.
- **תוצאה צפויה:** JSON עם שדות: `engine, version, status, timestamp, dashboard, whatsapp, supabase`.
- **איך לוודא:** curl + בדיקת קיום כל השדות.

### 24. ★ API response shape — /api/rfq/:id/decide
- **תנאי מקדים:** RFQ עם הצעות.
- **צעדים:** POST decide.
- **תוצאה צפויה:** JSON עם `decision_id, purchase_order_id, winner, all_quotes, savings.amount, savings.percent, reasoning (array), message`.
- **איך לוודא:** `jq` לוידוא המבנה.

### 25. Dashboard state — refresh() ריבוי קריאות מקבילות
- **תנאי מקדים:** Dashboard פתוח.
- **צעדים:** לחץ על כפתור 🔄 הרענון 3 פעמים ברצף.
- **תוצאה צפויה:** אין crash, ה-state מתעדכן, לא נראים "undefined" בכרטיסים.
- **איך לוודא:** Console בדפדפן — ללא errors, KPI מתעדכנים.

### 26. Migration 001 idempotent (CREATE IF NOT EXISTS)
- **תנאי מקדים:** 001 כבר רץ.
- **צעדים:** הרץ שוב את 001.
- **תוצאה צפויה:** אין שגיאות (רק triggers עלולים לזרוק אם כבר קיימים — חריג מתועד).
- **איך לוודא:** הרצה חוזרת ב-SQL Editor.

### 27. שינוי בקטגוריה של מוצר לא שובר את RFQ search
- **תנאי מקדים:** מוצר אחד עם קטגוריה חדשה.
- **צעדים:** `GET /api/suppliers/search/אלומיניום`.
- **תוצאה צפויה:** מחזיר רק ספקים עם active=true ושיש להם מוצר בקטגוריה זו.
- **איך לוודא:** curl + השוואה ל-SQL: `SELECT DISTINCT s.id FROM suppliers s JOIN supplier_products sp ON sp.supplier_id=s.id WHERE s.active AND sp.category='אלומיניום';`.

### 28. הוספת שדה חדש לטבלת suppliers לא שובר SELECT *
- **תנאי מקדים:** migration חדש.
- **צעדים:** `GET /api/suppliers/:id`.
- **תוצאה צפויה:** מחזיר 200 עם כל השדות, כולל החדש.
- **איך לוודא:** curl.

---

## קטגוריה 4 — בינאום (i18n / עברית RTL)

### 29. ★ ה-app container עם `direction: "rtl"`
- **תנאי מקדים:** dashboard טעון.
- **צעדים:** DevTools → בדוק את `<div>` הראשי.
- **תוצאה צפויה:** `style.direction === "rtl"`.
- **איך לוודא:** Inspect → computed styles → `direction: rtl`.

### 30. ★ Tabs בעברית — אין placeholder אנגלי
- **תנאי מקדים:** dashboard טעון.
- **צעדים:** צפה ב-nav.
- **תוצאה צפויה:** "דשבורד", "ספקים", "בקשת מחיר", "הצעות", "הזמנות", "קבלנים", "החלטת קבלן".
- **איך לוודא:** UI view + `grep 'label:' web/onyx-dashboard.jsx`.

### 31. ★ הודעות error מה-API בעברית
- **תנאי מקדים:** trigger שגיאה: RFQ send בלי ספקים.
- **צעדים:** שלח RFQ לקטגוריה לא קיימת.
- **תוצאה צפויה:** error message מכיל "לא נמצאו ספקים".
- **איך לוודא:** `curl ...` → body.error מכיל טקסט עברי.

### 32. ★ שם החברה — "טכנו כל עוזי" נשמר ב-RFQ
- **תנאי מקדים:** RFQ נשלח.
- **צעדים:** בדוק `rfqs.message_text` של הרשומה החדשה.
- **תוצאה צפויה:** הטקסט מכיל "טכנו כל עוזי".
- **איך לוודא:** SQL: `SELECT message_text FROM rfqs ORDER BY created_at DESC LIMIT 1;` — מכיל "טכנו כל עוזי".

### 33. Toast בעברית
- **תנאי מקדים:** פעולה כלשהי (הוסף ספק).
- **צעדים:** צפה ב-Toast.
- **תוצאה צפויה:** נוסח עברי (לדוגמה: "שם וטלפון חובה", "נוסף").
- **איך לוודא:** UI.

### 34. Locale של תאריכים = he-IL
- **תנאי מקדים:** הזמנה קיימת.
- **צעדים:** בדוק טקסט התאריך ב-dashboard.
- **תוצאה צפויה:** פורמט ישראלי (DD/MM/YYYY).
- **איך לוודא:** grep `toLocaleDateString("he-IL")` במקור — חייב להישמר.

### 35. Deadline ב-RFQ מתורגם he-IL
- **תנאי מקדים:** RFQ נשלח.
- **צעדים:** בדוק את ה-message_text.
- **תוצאה צפויה:** תאריך בפורמט עברי + שעה.
- **איך לוודא:** `SELECT message_text FROM rfqs` — בדוק שלא יש "AM/PM".

### 36. אין string literal באנגלית ב-tab labels
- **תנאי מקדים:** קריאה סטטית של הקוד.
- **צעדים:** grep ל-labels.
- **תוצאה צפויה:** כל `label:` בעברית.
- **איך לוודא:** `grep -n "label:" web/onyx-dashboard.jsx` ווידוא.

---

## קטגוריה 5 — Visual Regression

### 37. צבעי brand נשמרים
- **תנאי מקדים:** UI טעון.
- **צעדים:** בדוק styles.
- **תוצאה צפויה:** `logo` gradient = `linear-gradient(135deg, #f59e0b, #ef4444)`, background app = `#0c0f1a`, primary text = `#e2e8f0`.
- **איך לוודא:** DevTools → computed styles של `.logo`, `.app`.

### 38. Tab פעיל עם highlight כתום
- **תנאי מקדים:** לחץ tab.
- **צעדים:** בדוק צבעים.
- **תוצאה צפויה:** `background: rgba(245,158,11,0.12)`, `color: #f59e0b`, גבול תחתון כתום.
- **איך לוודא:** DevTools → בדוק `tabActive` style.

### 39. KPI grid responsive
- **תנאי מקדים:** dashboard.
- **צעדים:** שנה גודל חלון בין 400px ל-1200px.
- **תוצאה צפויה:** הכרטיסים עוטפים עצמם (minmax(140px, 1fr)), בלי overflow אופקי.
- **איך לוודא:** Chrome responsive mode.

### 40. KPI cards — 4 קטגוריות קבועות
- **תנאי מקדים:** dashboard.
- **צעדים:** ספור KPI cards.
- **תוצאה צפויה:** "ספקים פעילים", "הזמנות פעילות", "RFQs פתוחים", "חיסכון כולל".
- **איך לוודא:** UI.

### 41. אייקונים emoji קיימים בכל tab
- **תנאי מקדים:** nav.
- **צעדים:** ודא אייקונים: 📊 🏭 📤 📥 📦 👷 🎯.
- **תוצאה צפויה:** כולם מוצגים.
- **איך לוודא:** UI + grep `icon:` בקוד.

### 42. גופן Rubik נטען מ-Google Fonts
- **תנאי מקדים:** dashboard טעון.
- **צעדים:** Network tab → fonts.gstatic.com → Rubik.
- **תוצאה צפויה:** font loaded, `font-family: 'Rubik'` applied.
- **איך לוודא:** `grep "family=Rubik"` + Network tab.

### 43. Status dot — ירוק כשפעיל
- **תנאי מקדים:** שרת מחזיר `status === "operational"`.
- **צעדים:** בדוק צבע של הנקודה בכותרת.
- **תוצאה צפויה:** `#34d399` (ירוק).
- **איך לוודא:** DevTools.

### 44. Score circle עם gradient כתום-אדום
- **תנאי מקדים:** Tab ספקים.
- **צעדים:** בדוק scoreCircle של כל supplier card.
- **תוצאה צפויה:** `linear-gradient(135deg, #f59e0b, #ef4444)`.
- **איך לוודא:** DevTools.

### 45. ★ Status badges — כל 8 הסטטוסים של PO מקבלים צבע
- **תנאי מקדים:** הזמנה בכל סטטוס.
- **צעדים:** בדוק את ה-object `statusColors` בקוד.
- **תוצאה צפויה:** צריכים להיות draft, pending_approval, approved, sent, confirmed, delivered, closed, cancelled. **חריג ידוע [BUG: F-05]:** חסרים shipped, inspected, disputed (כפי שמוגדרים ב-schema). אחרי תיקון F-05 — כל 11 הסטטוסים חייבים צבע.
- **איך לוודא:** `grep statusColors web/onyx-dashboard.jsx` + `grep "CHECK (status IN" supabase/migrations/001-supabase-schema.sql`.

---

## קטגוריה 6 — Performance Benchmarks

### 46. ★ First dashboard load < 3s על wired
- **תנאי מקדים:** server cold, DB מוכן, connection wired.
- **צעדים:** clear cache → נווט ל-dashboard → מדוד עד שה-4 KPI cards מופיעים.
- **תוצאה צפויה:** < 3000 ms.
- **איך לוודא:** Chrome DevTools Performance → מדוד Time to Interactive.

### 47. ★ Refresh interval — בדיוק 30 שניות
- **תנאי מקדים:** dashboard טעון.
- **צעדים:** צפה ב-Network tab ב-/api/status תוך 2 דקות.
- **תוצאה צפויה:** קריאות ב-intervals של 30 שניות.
- **איך לוודא:** `grep "30000" web/onyx-dashboard.jsx` + Network tab. Important: הערך 30000 ms חייב להישמר.

### 48. Promise.all ב-refresh() מקבילי
- **תנאי מקדים:** קוד `onyx-dashboard.jsx` שורה 36.
- **צעדים:** ודא שימוש ב-`Promise.all([...])`.
- **תוצאה צפויה:** 6 קריאות API מקבילות, לא sequential.
- **איך לוודא:** code review + Network tab — 6 requests בו-זמנית.

### 49. `/api/suppliers` < 500 ms
- **תנאי מקדים:** 13 ספקים בבסיס.
- **צעדים:** `curl -w "%{time_total}\n" /api/suppliers`.
- **תוצאה צפויה:** < 0.5 s.
- **איך לוודא:** curl timing.

### 50. `/api/rfq/:id/decide` < 2 s
- **תנאי מקדים:** RFQ עם 3 הצעות.
- **צעדים:** מדוד POST decide.
- **תוצאה צפויה:** < 2 s (כולל INSERT של PO + PO lines + decision + update RFQ + audit).
- **איך לוודא:** `curl -w "%{time_total}"`.

### 51. לא רצות ≥ 10 קריאות API בלחיצה אחת
- **תנאי מקדים:** dashboard.
- **צעדים:** לחץ tab "דשבורד" → ספור network requests.
- **תוצאה צפויה:** ≤ 6 (1 לכל endpoint ב-refresh).
- **איך לוודא:** DevTools Network.

---

## קטגוריה 7 — Calculation Accuracy

### 52. ★ Scoring fixture — 2 הצעות, A=1000 / B=1200 → A מנצח
- **תנאי מקדים:** RFQ עם 2 הצעות בלבד. ספק A: total_price=1000, delivery_days=5, rating=8, reliability=8. ספק B: total_price=1200, delivery_days=5, rating=8, reliability=8.
- **צעדים:** POST `/api/rfq/:id/decide` עם משקולות ברירת מחדל (price=0.50, delivery=0.15, rating=0.20, reliability=0.15).
- **תוצאה צפויה:**
  - maxPrice=1200, minPrice=1000, priceRange=200.
  - A.priceScore = ((1200−1000)/200)×100 = 100.
  - B.priceScore = ((1200−1200)/200)×100 = 0.
  - deliveryScore שווה לשניהם (100).
  - ratingScore = 80 לשניהם.
  - reliabilityScore = 80 לשניהם.
  - A.weighted = round(100×0.5 + 100×0.15 + 80×0.2 + 80×0.15) = round(50 + 15 + 16 + 12) = **93**.
  - B.weighted = round(0×0.5 + 100×0.15 + 80×0.2 + 80×0.15) = round(0 + 15 + 16 + 12) = **43**.
  - Winner = A. savings = 200. savings_percent = 16.7.
- **איך לוודא:** curl + בדוק `winner.supplier_name === "A"` + `winner.weighted_score === 93`.

### 53. Fixture — subcontractor % vs sqm
- **תנאי מקדים:** קבלן "משה מעקות" (15%, 350/מ"ר, min=5000). פרויקט: value=120000, area=280.
- **צעדים:** POST decide.
- **תוצאה צפויה:**
  - costByPct = 120000 × 0.15 = 18000 (above min).
  - costBySqm = 280 × 350 = 98000.
  - bestMethod = "percentage" (18000 < 98000).
  - bestCost = 18000.
- **איך לוודא:** curl → `winner.best_cost = 18000`, `winner.best_method = "percentage"`.

### 54. VAT calc — 18%
- **תנאי מקדים:** POST quote: vat_included=false, subtotal=1000, delivery_fee=0.
- **צעדים:** submit.
- **תוצאה צפויה:** `vat_amount = 180`, `total_with_vat = 1180`.
- **איך לוודא:** DB: `SELECT vat_amount, total_with_vat FROM supplier_quotes ORDER BY created_at DESC LIMIT 1;`.

### 55. Discount in line item
- **תנאי מקדים:** שורת הצעה: quantity=10, unit_price=100, discount_percent=20.
- **צעדים:** POST quote.
- **תוצאה צפויה:** `total_price = 10 × 100 × 0.80 = 800`.
- **איך לוודא:** DB: `SELECT total_price FROM quote_line_items WHERE name=:name;` = 800.

### 56. Savings percent — 4 ספרים נכונים
- **תנאי מקדים:** maxPrice=1200, winner=1000.
- **צעדים:** בדוק savings_percent.
- **תוצאה צפויה:** savings_amount=200, savings_percent=16.7 (round(16.666×10)/10).
- **איך לוודא:** בדוק response.

### 57. Free delivery overrides delivery_fee
- **תנאי מקדים:** quote עם free_delivery=true, delivery_fee=50.
- **צעדים:** POST quote.
- **תוצאה צפויה:** `delivery_fee = 0` נשמר, לא 50.
- **איך לוודא:** DB select.

### 58. [BUG: F-04] הצעה יחידה — priceScore נופל ל-0 כרגע
- **תנאי מקדים:** RFQ עם הצעה אחת בלבד.
- **צעדים:** decide.
- **תוצאה צפויה (אחרי תיקון F-04):** priceScore צריך להיות 100 (מקסימום) כי אין השוואה.
- **תוצאה נוכחית:** priceScore=0 (maxPrice=minPrice → (0/1)×100=0).
- **איך לוודא:** עד תיקון — חריג מוכר. אחרי תיקון — `winner.price_score = 100`.

### 59. Subcontractor minimum_price kicks in
- **תנאי מקדים:** project_value=10000, area_sqm=1, subcontractor "משה מעקות" min=5000.
- **צעדים:** decide.
- **תוצאה צפויה:** costByPct = 10000 × 0.15 = 1500, מועלה ל-5000 (מינימום). bestCost = min(5000, max(350,5000)) = 5000.
- **איך לוודא:** curl + בדוק bestCost=5000.

---

## קטגוריה 8 — Migration Safety

### 60. ★ [BUG: F-06] 002-seed לא ניתן להרצה חוזרת אחרי שימוש
- **תנאי מקדים:** המערכת נמצאה בשימוש — יש purchase_orders, rfqs, price_history, audit_log על ספקים קיימים.
- **צעדים:** הרץ את 002 שוב ב-SQL Editor.
- **תוצאה צפויה (אחרי תיקון F-06):** המיגרציה חייבת להיות idempotent — למחוק רק seed data ולא data אמיתית; או להשתמש ב-`ON CONFLICT DO NOTHING` לכל INSERT.
- **תוצאה נוכחית:** כישלון — DELETE על suppliers ייכשל או יעשה CASCADE על nested FKs (supplier_products → price_history → po_line_items).
- **איך לוודא:** עד תיקון — **לעולם לא להריץ 002 על DB בשימוש**. חריג מוכר. אחרי תיקון — 002 חייב לרוץ בהצלחה פעמיים רצוף.

### 61. 001-schema — CREATE IF NOT EXISTS שומר על idempotency של tables
- **תנאי מקדים:** 001 רץ פעם אחת.
- **צעדים:** הרץ שוב.
- **תוצאה צפויה:** הטבלאות לא נמחקות, נתונים נשמרים.
- **איך לוודא:** SQL: ספור שורות לפני + אחרי — זהה.

### 62. CREATE TRIGGER ללא IF NOT EXISTS — הרצה חוזרת תזרוק
- **תנאי מקדים:** 001 רץ פעם.
- **צעדים:** הרץ שוב את חלק ה-triggers.
- **תוצאה צפויה:** שגיאה "trigger already exists" — חריג מוכר, יש לטפל ב-`DROP TRIGGER IF EXISTS` לפני.
- **איך לוודא:** הרצה ב-SQL Editor.

### 63. ★ FK cascade — מחיקת ספק מוחקת את products שלו
- **תנאי מקדים:** ספק עם 5 products.
- **צעדים:** `DELETE FROM suppliers WHERE id=:id;`.
- **תוצאה צפויה:** 5 rows ב-supplier_products נעלמים (ON DELETE CASCADE).
- **איך לוודא:** SQL: count products לפני/אחרי.

### 64. FK אינו מוחק audit_log כאשר ספק נמחק
- **תנאי מקדים:** ספק עם audit rows.
- **צעדים:** DELETE supplier.
- **תוצאה צפויה:** audit_log נשמר (entity_id נשאר UUID, אין FK).
- **איך לוודא:** SQL: SELECT COUNT audit_log — ללא שינוי.

### 65. Run order — 001 חייב לרוץ לפני 002
- **תנאי מקדים:** DB ריק.
- **צעדים:** נסה להריץ 002 לבד.
- **תוצאה צפויה:** שגיאה — טבלאות לא קיימות.
- **איך לוודא:** שגיאה מפורשת.

### 66. new migration 003+ לא שובר existing seed
- **תנאי מקדים:** PR מוסיף migration 003.
- **צעדים:** הרץ 001 → 002 → 003.
- **תוצאה צפויה:** counts של 13/100+/8 נשמרים.
- **איך לוודא:** SQL count אחרי 003.

---

## קטגוריה 9 — Audit Trail

### 67. ★ יצירת ספק → audit row נכתב
- **תנאי מקדים:** POST /api/suppliers.
- **צעדים:** צור ספק.
- **תוצאה צפויה:** audit_log מקבל שורה עם `entity_type='supplier', action='created'`.
- **איך לוודא:** SQL: `SELECT * FROM audit_log WHERE entity_type='supplier' ORDER BY created_at DESC LIMIT 1;`.

### 68. ★ עדכון ספק → audit עם previous_value + new_value
- **תנאי מקדים:** PATCH /api/suppliers/:id.
- **צעדים:** שנה rating.
- **תוצאה צפויה:** audit row עם both previous_value (JSON) + new_value (JSON).
- **איך לוודא:** SQL: `SELECT previous_value, new_value FROM audit_log WHERE action='updated' AND entity_type='supplier' ORDER BY created_at DESC LIMIT 1;`.

### 69. ★ RFQ sent → audit row
- **תנאי מקדים:** POST /api/rfq/send.
- **צעדים:** שלח RFQ.
- **תוצאה צפויה:** audit עם `entity_type='rfq', action='sent'`, detail מכיל "RFQ שנשלח ל-X ספקים".
- **איך לוודא:** SQL select.

### 70. ★ PO approved → audit
- **תנאי מקדים:** PO ב-draft.
- **צעדים:** POST /approve.
- **תוצאה צפויה:** audit עם `action='approved'`, detail מכיל ₪<total>.
- **איך לוודא:** SQL.

### 71. ★ PO sent → audit (גם כשנכשל ב-WhatsApp)
- **תנאי מקדים:** WA_TOKEN לא מוגדר.
- **צעדים:** POST /send.
- **תוצאה צפויה:** audit נכתב עם action='sent'. [BUG: F-02]: ה-PO status מתעדכן ל-sent למרות שהשליחה נכשלה — עד תיקון זו התנהגות ידועה.
- **איך לוודא:** SQL.

### 72. Quote received → audit
- **תנאי מקדים:** POST /api/quotes.
- **צעדים:** הגש הצעה.
- **תוצאה צפויה:** audit עם `entity_type='quote', action='received'`, actor=supplier_name.
- **איך לוודא:** SQL.

### 73. Decision → audit
- **תנאי מקדים:** POST decide.
- **צעדים:** קרא.
- **תוצאה צפויה:** audit עם `entity_type='procurement_decision', action='decided'`.
- **איך לוודא:** SQL.

### 74. GET /api/audit מחזיר את ה-50 אחרונים
- **תנאי מקדים:** > 50 audit rows.
- **צעדים:** curl.
- **תוצאה צפויה:** `entries.length = 50`, מסודר DESC לפי created_at.
- **איך לוודא:** curl + bash check.

### 75. audit_log.created_at באינדקס (ביצועי query)
- **תנאי מקדים:** 001 רץ.
- **צעדים:** בדוק indexes.
- **תוצאה צפויה:** `idx_audit_created` קיים.
- **איך לוודא:** SQL: `SELECT indexname FROM pg_indexes WHERE tablename='audit_log';`.

---

## קטגוריה 10 — Error Handling

### 76. ★ POST /api/suppliers בלי שם → 400 JSON עם error
- **תנאי מקדים:** שרת חי.
- **צעדים:** `curl -X POST /api/suppliers -d '{}'`.
- **תוצאה צפויה:** status 400, body `{"error": "..."}`, **לא HTML**.
- **איך לוודא:** `curl -v` → Content-Type: application/json + body.error קיים.

### 77. ★ GET /api/suppliers/:id עם id לא קיים → 404 JSON
- **תנאי מקדים:** UUID רנדומלי.
- **צעדים:** `curl /api/suppliers/00000000-0000-0000-0000-000000000000`.
- **תוצאה צפויה:** 404 + `{"error": "Supplier not found"}`.
- **איך לוודא:** curl.

### 78. ★ POST /api/rfq/:id/decide בלי הצעות → 400 JSON
- **תנאי מקדים:** RFQ ריק.
- **צעדים:** decide.
- **תוצאה צפויה:** 400 + error בעברית.
- **איך לוודא:** curl.

### 79. ★ Dashboard api helper catches fetch errors
- **תנאי מקדים:** server כבוי.
- **צעדים:** dashboard קורא לכל endpoint.
- **תוצאה צפויה:** `{ error: e.message }` מוחזר — לא crash. Toast לא מופיע ב-refresh אוטומטי, אך לא שגיאה ב-console non-recoverable.
- **איך לוודא:** כבה שרת → טען dashboard → console error אחד, UI לא שבור.

### 80. ★ כל error response הוא JSON — לא plain text
- **תנאי מקדים:** כל endpoint עם error path.
- **צעדים:** trigger error (invalid JSON body).
- **תוצאה צפויה:** `Content-Type: application/json`, body מכיל `error` field.
- **איך לוודא:** curl -v לכל endpoint עם bad input.

### 81. ★ 500 errors — JSON לא HTML stacktrace
- **תנאי מקדים:** trigger internal error (למשל Supabase down).
- **צעדים:** קריאה ל-/api/suppliers.
- **תוצאה צפויה:** JSON `{"error": ...}` — לא Express default HTML.
- **איך לוודא:** curl עם Supabase URL invalid.

### 82. POST /api/subcontractors/decide בלי pricing ל-work_type → 400
- **תנאי מקדים:** work_type שלא קיים (למשל "טיפוח_גנים").
- **צעדים:** POST.
- **תוצאה צפויה:** 400 + `error: "אין קבלנים ל-..."`.
- **איך לוודא:** curl.

### 83. webhook WhatsApp verify — mismatched token → 403
- **תנאי מקדים:** WHATSAPP_VERIFY_TOKEN מוגדר.
- **צעדים:** `GET /webhook/whatsapp?hub.mode=subscribe&hub.verify_token=wrong`.
- **תוצאה צפויה:** 403.
- **איך לוודא:** curl.

### 84. POST /api/quotes עם line_items ריק → נשמר עם subtotal=0
- **תנאי מקדים:** quote.
- **צעדים:** POST עם line_items=[].
- **תוצאה צפויה:** נשמר, total_price=0. לא crash.
- **איך לוודא:** curl.

---

## קטגוריה 11 — General Invariants / Smoke Tests

### 85. ★ Server starts — port 3100 default
- **תנאי מקדים:** `.env` תקני.
- **צעדים:** `node server.js`.
- **תוצאה צפויה:** log "ONYX PROCUREMENT API SERVER" + Port 3100 + Supabase Connected.
- **איך לוודא:** terminal output.

### 86. ★ package.json dependencies לא השתנו ללא justification
- **תנאי מקדים:** PR.
- **צעדים:** diff package.json.
- **תוצאה צפויה:** express, @supabase/supabase-js, dotenv, cors — הליבה שמורה.
- **איך לוודא:** git diff.

### 87. /api/audit ברירת מחדל 50
- **תנאי מקדים:** curl.
- **צעדים:** `GET /api/audit`.
- **תוצאה צפויה:** max 50 רשומות.
- **איך לוודא:** `jq '.entries | length'`.

### 88. /api/analytics/savings אגרגציה נכונה
- **תנאי מקדים:** יש decisions.
- **צעדים:** curl.
- **תוצאה צפויה:** `total_savings = procurement.total + subcontractor.total`.
- **איך לוודא:** curl + math.

### 89. /api/analytics/spend-by-supplier — רק ספקים עם total_orders>0
- **תנאי מקדים:** יש 2 ספקים עם orders, אחד בלי.
- **צעדים:** curl.
- **תוצאה צפויה:** 2 suppliers ברשימה.
- **איך לוודא:** curl + spot check.

### 90. /api/analytics/spend-by-category מחזיר רשימה ממוינת desc
- **תנאי מקדים:** line items בכמה קטגוריות.
- **צעדים:** curl.
- **תוצאה צפויה:** סדר יורד לפי total.
- **איך לוודא:** curl + check.

### 91. ★ CORS פתוח — dashboard מ-origin שונה לא חסום
- **תנאי מקדים:** `app.use(cors())` בקוד.
- **צעדים:** curl עם Origin header.
- **תוצאה צפויה:** response headers: `access-control-allow-origin: *`.
- **איך לוודא:** `curl -H "Origin: http://example.com" -v /api/status | grep -i access-control`.

### 92. Response bodies של POST — status code 201 ולא 200
- **תנאי מקדים:** POST create endpoints.
- **צעדים:** POST.
- **תוצאה צפויה:** 201 Created לכל create endpoints (suppliers, purchase-requests, rfq/send, quotes).
- **איך לוודא:** curl -w "%{http_code}".

### 93. RFQ יוצר rfq_recipients row לכל ספק
- **תנאי מקדים:** 3 ספקים בקטגוריה.
- **צעדים:** send RFQ.
- **תוצאה צפויה:** 3 rows ב-rfq_recipients.
- **איך לוודא:** SQL count.

### 94. RFQ code pattern — "RFQ-<timestamp>"
- **תנאי מקדים:** RFQ נשלח.
- **צעדים:** בדוק response.rfq_code.
- **תוצאה צפויה:** מתחיל ב-"RFQ-".
- **איך לוודא:** regex check.

### 95. supplier_dashboard view כולל product_count
- **תנאי מקדים:** query view.
- **צעדים:** SELECT.
- **תוצאה צפויה:** לכל ספק, product_count >= 0.
- **איך לוודא:** SQL.

### 96. ★ Tab "סעיף סיכום חיסכון" אינו שובר גם כשסאבינגס=0
- **תנאי מקדים:** DB ריק.
- **צעדים:** פתח dashboard.
- **תוצאה צפויה:** "₪0" מוצג, לא NaN, לא undefined.
- **איך לוודא:** UI.

### 97. [BUG: F-01] SubDecide: project_value=0 לא מתפוצץ
- **תנאי מקדים:** input=0.
- **צעדים:** POST decide.
- **תוצאה צפויה (אחרי תיקון):** 400 + "סכום ושטח חייבים > 0". נוכחי — עובר ומחזיר NaN.
- **איך לוודא:** curl + בדוק את `winner.best_cost`.

### 98. [BUG: F-03] `.single()` ללא error guard
- **תנאי מקדים:** cases עם .single() — suppliers/:id, rfq detail.
- **צעדים:** id לא קיים.
- **תוצאה צפויה (אחרי תיקון):** 404 JSON. נוכחי — יכול לזרוק 500 / undefined.
- **איך לוודא:** curl עם UUID רנדומלי לכל endpoint.

### 99. system_events נכתב על RFQ send
- **תנאי מקדים:** RFQ נשלח.
- **צעדים:** בדוק system_events.
- **תוצאה צפויה:** שורה עם `type='rfq_sent'`, severity=info.
- **איך לוודא:** SQL.

### 100. ★ End-to-end happy path — PR → RFQ → Quote → Decide → PO → Approve → Send
- **תנאי מקדים:** seed, WA_TOKEN=mock.
- **צעדים:** הרץ את כל הזרימה ברצף.
- **תוצאה צפויה:** בסוף יש 1 row חדשה ב-`purchase_orders` (status=sent) + שרשרת של audit_log rows לכל שלב + procurement_decisions row + rfq.status=decided + purchase_requests.status=rfq_sent.
- **איך לוודא:** SQL batch:
  ```sql
  SELECT
    (SELECT COUNT(*) FROM audit_log WHERE created_at > NOW() - INTERVAL '5 minutes') AS audit_rows,
    (SELECT COUNT(*) FROM procurement_decisions WHERE decided_at > NOW() - INTERVAL '5 minutes') AS decisions,
    (SELECT status FROM purchase_orders ORDER BY created_at DESC LIMIT 1) AS latest_po_status;
  ```
  — חייב להחזיר audit_rows ≥ 6, decisions = 1, latest_po_status = 'sent'.

---

## סיכום — אילו פריטים חוסמים merge

פריטים עם **★** הם חסמי merge. אם אחד נכשל — התיקון חייב להיות ב-PR לפני merge. שאר הפריטים הם "soft checks" — כישלון מקובל אם מתועד בהערות PR.

### באגים מוכרים (חריגים רשמיים)
- **F-01** — SubDecide input validation (פריט 97)
- **F-02** — PO status=sent כשנכשל (פריט 71)
- **F-03** — `.single()` error guard (פריט 98)
- **F-04** — הצעה יחידה priceScore=0 (פריט 58)
- **F-05** — status color codes חסרים shipped/inspected/disputed (פריט 45)
- **F-06** — 002-seed לא idempotent (פריט 60)

### שכבות בדיקה (לפי סדר מהיר→מלא)
1. **Smoke (3 דקות):** פריטים 1, 3, 11, 85, 91.
2. **Critical path (15 דקות):** כל ה-★.
3. **Full regression (60 דקות):** כל 100 הפריטים.
