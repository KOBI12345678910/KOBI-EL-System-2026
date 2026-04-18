# 🔍 QA WAVE 1 — דוח בדיקה ישירה (Direct Static Inspection)

**תאריך:** 2026-04-11
**היקף:** onyx-procurement (server.js 934 שורות, onyx-dashboard.jsx 710 שורות, schema 562 שורות, seed 320 שורות)
**שיטה:** בדיקה ידנית-ישירה של הקוד מול הסכמה והדשבורד — לא סימולציה

---

## 🚨 חסמים קריטיים (BLOCKERS) — חייבים תיקון לפני שחרור

### B-01 · פורט לא מסונכרן: Dashboard ↔ Server ↔ SETUP guide
**חומרה:** 🔴 קריטי
**מיקום:**
- `web/onyx-dashboard.jsx:3` → `const API = "http://localhost:3100";`
- `server.js:908` → `const PORT = process.env.PORT || 3100;`
- `.env.example:20` → `PORT=3100`
- `SETUP-GUIDE-STEP-BY-STEP.md` שלב 2.4 → מורה לקובי לכתוב `PORT=3000`
- `SETUP-GUIDE-STEP-BY-STEP.md` שלב 2.6 → "Port: 3000" בתצוגה לדוגמה

**תוצאה:** קובי יגדיר PORT=3000 לפי המדריך, השרת יאזין על 3000, הדשבורד ידבר עם 3100. **שום בקשה לא תעבור.** כל ה-UI ייראה כאילו הוא תקוע בטעינה/ "לא מחובר".

**תיקון:** לעדכן את `SETUP-GUIDE-STEP-BY-STEP.md` לכתוב `PORT=3100` (כדי להישאר בעקביות עם כל שאר הקבצים). אסור לשנות את הקוד — "לא מוחקים רק משדרגים".

---

### B-02 · Dashboard מחובר ל-`localhost` — לא יעבוד ברגע שיתארח ב-Replit
**חומרה:** 🔴 קריטי
**מיקום:** `web/onyx-dashboard.jsx:3`

```jsx
const API = "http://localhost:3100";
```

**תוצאה:** ברגע שקובי יעלה את הדשבורד כ-static file ב-Replit או בכל hosting אחר, הדפדפן ינסה להגיע ל-`localhost:3100` של המשתמש הקצה — מה שלא יעבוד. הדשבורד יכול לעבוד *רק* כשהוא רץ על אותה מכונה של השרת.

**תיקון מוצע (שדרוג, לא מחיקה):**
```jsx
const API = import.meta.env.VITE_API_URL || window.location.origin || "http://localhost:3100";
```
או לפרוס את הדשבורד בתוך שרת ה-Express (express.static).

---

### B-03 · אפס הרשאות גישה — כל נקודת API פתוחה לחלוטין
**חומרה:** 🔴 קריטי אבטחה
**מיקום:** `server.js` — אין שום middleware אימות (auth)

**תוצאה:** מי שמגיע ל-URL של Replit יכול:
- ליצור ספקים חדשים
- לעדכן ספקים קיימים
- לשלוח RFQ דרך WhatsApp API של קובי (על חשבונו!)
- לאשר PO
- למחוק היסטוריית מחירים דרך cascade
- להוציא אודיט לוג, היסטוריית רכש, ספקים פרטיים

**תיקון מוצע (שדרוג):** middleware פשוט שבודק header `X-API-Key` מול `process.env.ONYX_API_KEY`. לא צריך OAuth מלא בשלב זה — מספיק Single Shared Secret.

---

### B-04 · WhatsApp Webhook — אין אימות חתימה של Meta
**חומרה:** 🔴 קריטי אבטחה
**מיקום:** `server.js:876-901`

```js
app.post('/webhook/whatsapp', async (req, res) => {
  const body = req.body;
  // ... ללא verification של X-Hub-Signature-256
});
```

**תוצאה:** כל אחד שמכיר את ה-URL יכול להזרים הודעות מזויפות למערכת שלך, שייכנסו ל-`system_events` ותראה אותן כאילו באו מספקים אמיתיים.

**תיקון:** לאמת את `X-Hub-Signature-256` דרך `crypto.createHmac('sha256', APP_SECRET)` לפני קבלת body.

---

### B-05 · `verify_token` משווה ב-`===` — פגיע ל-timing attack
**חומרה:** 🟡 בינוני אבטחה
**מיקום:** `server.js:869`

```js
if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
```

**תיקון:** `crypto.timingSafeEqual` (פחות קריטי ב-verify token אבל still).

---

## 🟠 שגיאות תוכנית (Functional Bugs) — ישפיעו על משתמשים

### F-01 · קבלן בלי שיעור אחוזים / מ"ר גורם ל-NaN שקט
**חומרה:** 🟠 גבוה
**מיקום:** `server.js:733-750` (`POST /api/subcontractors/decide`)

```js
let costByPct = project_value * (p.percentage_rate / 100);
let costBySqm = area_sqm * p.price_per_sqm;
```

השדות `percentage_rate` ו-`price_per_sqm` ב-schema הם `NUMERIC NOT NULL`, אז זה לא אמור לקרות. **אבל:** ה-AJI POST של `POST /api/subcontractors/:id/pricing` ב-`server.js:702` מקבל את זה מ-`req.body` ישירות וב-upsert — *לא מאמת NOT NULL client-side*. אם קליינט זדוני שולח `null` — שגיאה 400 תחזור (הגנת DB). OK.

**עדיין:** בחישוב `maxCost = Math.max(project_value * 0.5, area_sqm * 1000)` — אם `area_sqm = 0`, `maxCost` תלוי ב-project_value בלבד, וייתכן שיחלוק ב-0 מאוחר יותר.

**תיקון:** לוודא ב-client-side (dashboard `SubDecideTab`) ש-`area_sqm > 0` ו-`project_value > 0`. כרגע יש רק בדיקת "!". שווה להוסיף `> 0`.

---

### F-02 · PO status "sent" נרשם גם כשהשליחה נכשלה
**חומרה:** 🟠 גבוה
**מיקום:** `server.js:661-671`

```js
if (WA_TOKEN && address) {
  sendResult = await sendWhatsApp(address, message);
}

await supabase.from('purchase_orders').update({
  status: 'sent',
  sent_at: new Date().toISOString(),
}).eq('id', po.id);
```

**תוצאה:** גם אם `sendWhatsApp` נכשל (sendResult.success = false), ה-PO מסומן `status = 'sent'`. קובי יראה ב-UI שהכל יצא — בזמן שאף אחד לא קיבל את ההזמנה.

**תיקון:** להתנות `UPDATE status='sent'` על `sendResult.success`. אחרת `status` צריך להישאר `approved`.

---

### F-03 · `.single()` ללא error guard יכול להפיל endpoint שלם
**חומרה:** 🟠 גבוה
**מיקומים:**
- `server.js:279-285` — `.single()` ב-RFQ insert בלי error check
- `server.js:524-539` — `.single()` ב-PO insert בלי error check
- `server.js:569-570` — decision insert

**תוצאה:** אם Supabase מחזיר שגיאה (FK, network, permission), `rfq`/`po`/`decision` יהיו `undefined`, ושורות אחר כך יגשו `.id` על undefined → 500 Internal Server Error בלי מסר שימושי.

**תיקון:** לעטוף כל `.single()` ב-guard: `if (error || !data) return res.status(500).json(...)`.

---

### F-04 · `maxPrice === minPrice` → חיסכון 0 גם כשיש יתרון
**חומרה:** 🟡 בינוני
**מיקום:** `server.js:460` — `const priceRange = maxPrice - minPrice || 1;`

אם יש רק הצעה אחת (priceRange=0), ה-fallback ל-1 מחלץ את המכנה, אבל `priceScore = (maxPrice - quote.total_price) / 1 * 100 = 0`. כלומר עם הצעה אחת בלבד — ה-priceScore תמיד 0, וה-weighted score מוטה לטובת delivery/rating.

**תיקון הצעה:** עם הצעה אחת, לתת `priceScore = 100` אוטומטית (אין תחרות → מנצח).

---

### F-05 · Enum drift: `po.status` — חסרים color codes
**חומרה:** 🟢 נמוך (UI only)
**מיקום:** `web/onyx-dashboard.jsx:452`

```jsx
const statusColors = { draft, pending_approval, approved, sent, confirmed, delivered, closed, cancelled };
```

חסר: `shipped`, `inspected`, `disputed`. לא יקרוס — פשוט יראה תג אפור.

**תיקון:** להוסיף את שלושת הצבעים לטובת שלמות UX.

---

### F-06 · Re-run של 002-seed ייכשל אם יש כבר היסטוריה
**חומרה:** 🟠 גבוה (בעת אפדייט)
**מיקום:** `002-seed-data-extended.sql:8-10`

```sql
DELETE FROM subcontractor_pricing;
DELETE FROM subcontractors;
DELETE FROM supplier_products;
```

- `subcontractors` referenced by `subcontractor_decisions.selected_subcontractor_id` (no CASCADE) — DELETE ייכשל אם יש החלטות.
- `supplier_products` referenced by `price_history.product_id` (no CASCADE) — DELETE ייכשל אם הופעלה היסטוריית מחירים.

**תוצאה:** אחרי השימוש הראשון של קובי, אי אפשר להריץ את 002 שוב. המדריך מבקש להריץ אותו, ולא כותב איך להתאושש.

**תיקון:** להוסיף `DELETE FROM subcontractor_decisions;` ו-`DELETE FROM price_history;` לפני הדלג"ץ הקיים, או להוסיף `ON DELETE CASCADE` ל-FKs ב-001.

---

## 🟡 חוסר עקביות / תיעוד

### D-01 · 001-schema מכיל seed data ישן של 5 ספקים — Orphan Data
**חומרה:** 🟡 בינוני
**מיקום:** `001-supabase-schema.sql:498-556`

ה-schema עצמו מכיל INSERT של 5 ספקים ישנים (מתכת מקס, סטיל פרו, עיר הברזל, אלומיניום ישראל, זכוכית השרון), 12 מוצרים, 4 קבלני משנה, ו-9 pricing rules. ה-002 seed מנקה את אלה (בשורות 11-17) אז **אם הכל ירוץ לפי הסדר — אין בעיה.**

**הבעיה:** אם קובי מריץ את 001 בלבד (בלי 002), הדשבורד יתנהג לפי seed של 5 ספקים, ואז `workTypes` בדשבורד כולל "צביעה" ולא יהיה קבלן אחד ל"צביעה" — dropdown ריק אבל לא אזהרה.

**המלצה:** לפצל את ה-seed מ-001 לקובץ נפרד (`000-schema-only.sql` + `001-default-seed.sql` + `002-extended-seed.sql`), או להסיר את ה-seed מ-001.

---

### D-02 · SETUP guide מבטיח 15 ספקים — בפועל 13
**חומרה:** ✅ תוקן כבר
**הערה:** תיקנתי בקומיט `0986c81`. עכשיו המדריך כותב "13 ספקים (כולל יבוא מסין) + 100+ מוצרים".

---

### D-03 · Dashboard workTypes — צביעה נוסף
**חומרה:** ✅ תוקן כבר
**הערה:** תיקנתי בקומיט `1a55d03`. עכשיו התוסף `"צביעה"` מופיע ברשימה.

---

## 🟢 מידע על הארכיטקטורה (לא תקלות)

### I-01 · Single-file React (ללא Vite/build)
Dashboard הוא JSX יחיד לא מקומפל. כדי להריץ — צריך Vite/CRA או סקריפט של Babel בדפדפן. אין package.json ל-web/. יש סיכון שקובי ירוץ פשוט `npm install` ברמת onyx-procurement/ שכוללת רק express/supabase/dotenv/cors — לא React. המדריך גם לא מסביר איך להציג את הדשבורד.

**המלצה:** להוסיף תיקייה `web/` עם `index.html` שטוען את הדשבורד דרך ESM CDN, או להוסיף Vite config מלא.

### I-02 · `cors()` ללא origin whitelist
`server.js:19` — `app.use(cors());` פתוח לכל המקורות. בסדר לפיתוח, לא לפרודקשן.

### I-03 · ברירת מחדל `delivery_address = 'ריבל 37, תל אביב'`
`001-supabase-schema.sql:204` — מנציח את הכתובת של טכנו כל עוזי. מושלם בהיבט של עסק יחיד, אבל לא גמיש למולטי-tenant בעתיד.

### I-04 · RFQ `rfq_code` נוצר ב-memory בלבד
`server.js:256` — `const rfqId = \`RFQ-${Date.now().toString(36).toUpperCase()}\`;` — נוצר ב-server, נרשם בלוג ומוחזר לקליינט, **אבל לא נשמר ב-DB** כ-column ייעודי. החיפוש ב-DB לפי קוד RFQ אי אפשר (רק לפי UUID).

**המלצה:** להוסיף `code TEXT UNIQUE` לטבלת `rfqs` ולשמור שם.

---

## סיכום Wave 1 — טבלת עדיפות

| ID | תיאור | חומרה | נוהל |
|----|------|-------|------|
| B-01 | PORT: dashboard=3100, guide=3000 | 🔴 קריטי | תיקון מיידי — עדכון מדריך |
| B-02 | Dashboard `localhost` hardcoded | 🔴 קריטי | תיקון לפני deploy |
| B-03 | אפס auth על ה-API | 🔴 קריטי אבטחה | Middleware API key |
| B-04 | Webhook WhatsApp ללא signature | 🔴 קריטי אבטחה | HMAC check |
| B-05 | timing attack ב-verify_token | 🟡 בינוני | `timingSafeEqual` |
| F-01 | NaN ב-subcontractor decide | 🟠 גבוה | Input validation |
| F-02 | PO status=sent גם כשנכשל | 🟠 גבוה | תנאי על success |
| F-03 | `.single()` ללא guard | 🟠 גבוה | Error handling |
| F-04 | 1 quote → priceScore=0 | 🟡 בינוני | Fallback = 100 |
| F-05 | enum drift ב-status colors | 🟢 נמוך | השלמת ערכים |
| F-06 | 002 re-run fail | 🟠 גבוה | הוספת DELETEs |
| D-01 | 001 יש seed ישן | 🟡 בינוני | פיצול קובץ |
| D-02 | 15→13 ספקים | ✅ תוקן | — |
| D-03 | workTypes צביעה | ✅ תוקן | — |
| I-01 | Dashboard ללא Vite | 🟡 בינוני | הוספת build |
| I-02 | cors פתוח | 🟢 נמוך | whitelist |
| I-03 | delivery_address hardcoded | 🟢 נמוך | multi-tenant |
| I-04 | rfq code לא שמור | 🟡 בינוני | שדה UNIQUE |

---

**מספר סה"כ ממצאים:** 18
- קריטיים (🔴): 4
- גבוהים (🟠): 4
- בינוניים (🟡): 5
- נמוכים (🟢): 3
- כבר תוקנו (✅): 2

**המלצת Wave 1 → Wave 2:** לפני Wave 2, חייבים לתקן לפחות B-01..B-04 ו-F-02..F-03. אלה חסמי אבטחה ונכונות שמעטים לתפעל עם אותם symptoms.
