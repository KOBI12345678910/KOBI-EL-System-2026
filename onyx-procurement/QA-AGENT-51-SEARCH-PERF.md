# QA Agent #51 — Search & Filter Performance

**תאריך:** 2026-04-11
**סוכן:** QA Agent #51 — Static Analysis ONLY
**ממד בדיקה:** ביצועי חיפוש וסינון (Search & Filter Performance)
**קבצים שנבדקו:**
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\onyx-procurement\server.js`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\onyx-procurement\supabase\migrations\001-supabase-schema.sql`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\onyx-procurement\web\onyx-dashboard.jsx`

**לא משכפל:** QA-WAVE1-DIRECT-FINDINGS.md, QA-AGENT-14-LOAD-N1.md (Load/N+1).
**קשור ל-Agent 14** רק כשנדרש קישור לפג׳ינציה כבסיס לביצועי חיפוש.

---

## ניהול ממצאים בקיצור (TL;DR)

| # | נושא | חומרה | מצב |
|---|------|-------|------|
| F-51.01 | אין endpoint חיפוש חופשי כלל (אין `q=`) — רק חיפוש לפי `category` מדויק | HIGH (UX קריטי) | חסר |
| F-51.02 | אין שום אינדקס טקסטואלי (אין `gin`, אין `pg_trgm`, אין `tsvector`) | HIGH | חסר |
| F-51.03 | חיפוש קטגוריה (`/api/suppliers/search/:category`) משתמש ב-`.eq` case-sensitive ותלוי התאמה מדויקת 1:1 | HIGH | באג |
| F-51.04 | אין `ILIKE` בשום מקום — אז גם חיפוש "מכיל" לא קיים | HIGH | חסר |
| F-51.05 | סינון כל הרשימות (`suppliers`, `orders`, `rfqs`) נעשה בצד לקוח עם `Array.filter()` אחרי `Promise.all` — **לא** מגיעה DB | HIGH כשיגדל | באג עתידי |
| F-51.06 | אין Debouncing בשדות קלט — כרגע אין אפילו שדה חיפוש, אז הלקוח לא ידחוף DB בטעות, אבל כשיוסיפו — יקרה עומס | MED | חסר |
| F-51.07 | Dashboard מריץ `setInterval(refresh, 30000)` שמושך 6 endpoints במקביל — חיפוש עליו הוא כפל-עומס | MED | Agent 14 נגע בזה |
| F-51.08 | אין Pagination (`offset`/`cursor`) על שום list endpoint — חיפוש עתידי יחזיר את הכל ואז יסנן | HIGH בעתיד | חסר |
| F-51.09 | דיקטציית עברית ב-Postgres לא מוגדרת — אין `hebrew` config ואין אפילו `simple` | MED | חסר |
| F-51.10 | אין טיפול ב-nikud (ניקוד) — "ברזל" מול "בַּרְזֶל" יהיו מיתרים שונים | LOW | חסר |
| F-51.11 | שמות ספקים דו-לשוניים (עברית + אנגלית) — אין unicode normalization | MED | חסר |
| F-51.12 | אין Autocomplete endpoint (`/api/suggest?q=`) | MED | חסר |
| F-51.13 | אין URL params עבור state של סינון/טאבים — `tab`, `selectedRfq` כולם ב-state מקומי | MED | חסר |
| F-51.14 | אין Saved searches / favorite filters | LOW | חסר |
| F-51.15 | אין Search relevance ranking (score / BM25 / ts_rank) | MED | חסר |
| F-51.16 | התנהגות "חיפוש ריק" לא מוגדרת — אין endpoint, אין החלטה מה לעשות | MED | חסר |
| F-51.17 | Case sensitivity — `.eq('category', 'ברזל')` לא ימצא `'בַּרְזֶל'` או `'BRZ'` — אפילו אחת ותו | HIGH | באג |
| F-51.18 | אינדקס מורכב (composite) חסר כש-WHERE משלב `active + category` | MED | חסר אופטימיזציה |
| F-51.19 | `supplier_products(name)` — **שדה החיפוש הכי חשוב** — ללא אינדקס כלל | CRITICAL בהמשך | חסר |
| F-51.20 | `suppliers(name, contact_person, phone, email, whatsapp)` — **0 אינדקסים** על עמודות חיפוש | HIGH | חסר |

---

## 1. שיטת החיפוש הנוכחית (שיטה → ביצועים)

### מה **כן** קיים (בלבד)
רק endpoint בודד: `GET /api/suppliers/search/:category` (שורה 173-185 ב-`server.js`):

```js
app.get('/api/suppliers/search/:category', async (req, res) => {
  const { data } = await supabase
    .from('supplier_products')
    .select('*, suppliers(*)')
    .eq('category', req.params.category);   // ← .eq בלבד, case-sensitive, התאמה מלאה
  ...
});
```

**בעיות:**
1. **לא חיפוש אמיתי** — `.eq('category', X)` זה `WHERE category = 'X'`, לא `WHERE category ILIKE '%X%'`.
2. הקטגוריה נכנסת מ-URL path (`:category`) — חייבת להיות מילה מדויקת, בלי רווחים, בלי טעויות כתיב, בלי שגיאות unicode.
3. מחזיר **את כל המוצרים** של קטגוריה, ואז **ב-JavaScript** מסנן לפי `suppliers.active` (`Map` בשורה 180-184) — עבודה שאמורה להיות ב-DB.
4. אין `limit` כלל — כשהקטלוג יגדל ל-10,000 מוצרים, זה יחזיר 10,000.

### מה **אין** (וצריך להיות)
- **ILIKE** (`'%term%'`) — חיפוש "מכיל" — אין בכלל.
- **Full-text (`tsvector` / `to_tsvector` / `@@`)** — אין.
- **Trigram (`pg_trgm`, `gin_trgm_ops`)** — אין. אין התרה בטעויות כתיב.
- **Soundex / Metaphone / עברית phonetic** — לא רלוונטי ב-Postgres default, אבל אפשר להוסיף.

### מסקנה (F-51.01 + F-51.04)
**אין חיפוש טקסטואלי כלל במערכת.** המערכת מחזירה רשימות מלאות מ-backend והממשק בכלל לא חושף שדה `<input type="search">` לחיפוש ספק/מוצר/הזמנה.

---

## 2. אינדקסים — Cross-check מול WHERE clauses

### מה **כן** קיים (001-supabase-schema.sql)

כל האינדקסים הם `btree` דיפולטיים (לא מצוין מפורשות):

| אינדקס | טבלה | עמודה |
|--------|------|-------|
| `idx_supplier_products_category` | supplier_products | category |
| `idx_supplier_products_supplier` | supplier_products | supplier_id |
| `idx_price_history_supplier` | price_history | supplier_id |
| `idx_price_history_product` | price_history | product_key |
| `idx_pr_items_request` | purchase_request_items | request_id |
| `idx_rfq_recipients_rfq` | rfq_recipients | rfq_id |
| `idx_rfq_recipients_supplier` | rfq_recipients | supplier_id |
| `idx_quotes_rfq` | supplier_quotes | rfq_id |
| `idx_quotes_supplier` | supplier_quotes | supplier_id |
| `idx_quote_lines_quote` | quote_line_items | quote_id |
| `idx_po_supplier` | purchase_orders | supplier_id |
| `idx_po_status` | purchase_orders | status |
| `idx_po_project` | purchase_orders | project_id |
| `idx_po_lines_po` | po_line_items | po_id |
| `idx_sub_pricing_sub` | subcontractor_pricing | subcontractor_id |
| `idx_sub_pricing_type` | subcontractor_pricing | work_type |
| `idx_audit_entity` | audit_log | (entity_type, entity_id) |
| `idx_audit_created` | audit_log | created_at DESC |
| `idx_events_type` | system_events | type |
| `idx_events_severity` | system_events | severity |
| `idx_notifications_recipient` | notifications | recipient |
| `idx_notifications_sent` | notifications | sent |

### מה **אין** (קריטי לחיפוש)

| חסר אינדקס | למה חשוב | רמת חומרה |
|------------|----------|----------|
| `suppliers(name)` | כל חיפוש "ספק לפי שם" יעבור sequential scan על כל 13/100/1000 הרשומות | HIGH |
| `suppliers(active)` | סינון רשימה של פעילים (ודאי בשימוש ב-`supplier_dashboard` view) | MED |
| `suppliers(tags)` — GIN על מערך | יש עמודה `tags TEXT[]` — בלי GIN, חיפוש לפי תגית = scan מלא | MED |
| `supplier_products(name)` | חיפוש מוצר לפי שם — הכי קריטי למשתמש | CRITICAL |
| `supplier_products(sku)` | סריקה לפי SKU | HIGH |
| `purchase_orders(status, created_at DESC)` — composite | רשימת הזמנות לטאב "פעילות" מיוצגת | MED |
| `purchase_requests(status)` | בשימוש ב-GET /api/purchase-requests עם order | MED |
| `subcontractors(name)` | חיפוש קבלן | MED |
| `subcontractors(specialties)` — GIN על `TEXT[]` | חיפוש לפי התמחות — כרגע scan מלא על המערך | MED |
| Full-text index (`to_tsvector('simple', name || description)`) | חיפוש חכם של מוצר לפי שם+תיאור | HIGH |
| `pg_trgm` extension + GIN | טיפול בטעויות כתיב וחיפוש חלקי ב-ILIKE מהיר | HIGH |

### Cross-check ב-`server.js` — WHERE clauses שלא מכוסות

| שורה | Query | עמודה ב-WHERE | יש אינדקס? |
|------|-------|----------------|-----------|
| 134 | `supplier_dashboard .order('overall_score', desc)` | `overall_score` | **❌ אין** — sort על עמודה לא מאונדקסת |
| 130 | `GET /api/suppliers` (via `supplier_dashboard`) | אין WHERE, רק ORDER | — |
| 828 | `suppliers.gt('total_orders', 0)` | `total_orders` | **❌ אין** |
| 830 | `.order('total_spent', desc)` | `total_spent` | **❌ אין** |
| 142 | `supplier_products.eq('supplier_id', X)` | `supplier_id` | ✅ יש |
| 143 | `price_history.eq('supplier_id', X).order('recorded_at', desc)` | `supplier_id, recorded_at` | ✅ חצי — יש על `supplier_id`, **אין על `recorded_at`** |
| 177 | `supplier_products.eq('category', X)` | `category` | ✅ יש |
| 242 | `supplier_products.in('category', cats)` | `category` | ✅ יש |
| 397-399 | `rfq_recipients.eq('rfq_id').eq('supplier_id')` | שני אינדקסים נפרדים | **⚠️ composite חסר** |
| 601-604 | `purchase_orders.order('created_at', desc)` | `created_at` | **❌ אין אינדקס** על `created_at` — sort מלא |
| 687 | `subcontractors.order('quality_rating', desc)` | `quality_rating` | **❌ אין** |
| 853-854 | `audit_log.order('created_at', desc).limit(50)` | `created_at` | ✅ יש (`idx_audit_created DESC`) |

**סיכום סעיף 2:**
- אין תמיכת **אינדקס מלאה** לשימושי sort של ה-endpoint רשימות (פרט ל-`audit_log`).
- אין אף אינדקס שיתמוך ב-**חיפוש טקסט** עתידי.
- אין אינדקסים מורכבים (composite) עבור filter+sort משולבים.

---

## 3. עברית + Full-text — המצב

**Postgres default לא כולל dictionary עברית.** זה אומר:

- הגדרת `to_tsvector('hebrew', name)` **לא תעבוד** בלי extension מותאם (קיימת `pg_hebrew` של מתנדבים, אבל אינה רשמית).
- האפשרות הריאלית: **`to_tsvector('simple', name)`** — לא stemming, לא stop-words, אבל עובד על tokenization בסיסית של unicode.
- עבור עברית, `simple` + `pg_trgm` הוא פתרון סביר:
  - `pg_trgm` נותן חיפוש חלקי/טעויות כתיב.
  - `simple` נותן token match.

**המערכת כרגע לא הגדירה אף אחד מאלה** (אף לא `CREATE EXTENSION pg_trgm`).

**F-51.09 (המלצה):**
```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX idx_suppliers_name_trgm ON suppliers USING gin (name gin_trgm_ops);
CREATE INDEX idx_products_name_trgm ON supplier_products USING gin (name gin_trgm_ops);
CREATE INDEX idx_products_fts ON supplier_products
  USING gin (to_tsvector('simple', coalesce(name,'') || ' ' || coalesce(description,'')));
```

### Nikud / ניקוד (F-51.10)

אין נורמליזציה של ניקוד. `unaccent` של Postgres עובד על לטינית ונלווה ל-diacritics, אבל על עברית מלא לא עוזר — צריך custom function שמסירה תווים `\u0591-\u05C7`. כיום **אף ספק לא ניקדה ידנית**, אבל אם משתמש יקליד "ברזל" והקטלוג יכיל "בַּרְזֶל" — יחטיא.

המלצה (אם רלוונטי): פונקציה `remove_hebrew_nikud(text)` שמוחקת את הטווח הנ"ל, ובניית `tsvector` עליה.

### Unicode normalization (F-51.11)

שמות ספקים אמיתיים יהיו גם באנגלית: "Metal Max", "מתכת מקס". כרגע אין normalization ל-NFKC/NFC. זה יכול ליצור בעיות עם Unicode ligatures או RTL marks בהודבקים ממקורות חיצוניים.

---

## 4. Pagination — Offset מול Cursor

**מצב:** אין Pagination כלל על אף endpoint (למעט `audit_log` עם `limit` ידני).

- `GET /api/suppliers` — מחזיר הכל.
- `GET /api/suppliers/search/:category` — מחזיר הכל.
- `GET /api/purchase-orders` — מחזיר הכל + `po_line_items` (nested join).
- `GET /api/purchase-requests` — מחזיר הכל + items.
- `GET /api/subcontractors` — מחזיר הכל.
- `GET /api/rfqs` (via `rfq_summary` view) — מחזיר הכל.

**חשוב לדמיד של חיפוש:** חיפוש חופשי **חייב** להגיע עם pagination. אחרת `q=ב` יחזיר תוצאות ענק. כדאי קודם להגדיר אסטרטגיה:

- **Offset** (`.range(0, 19)` ב-Supabase JS, מתורגם ל-`LIMIT 20 OFFSET 0`): קל, אבל מאט ב-`OFFSET 10000` (scan מלא עד הנקודה).
- **Cursor** (`.gt('created_at', last_seen).limit(20)`): קבוע ב-O(log N), אבל דורש `ORDER BY` יציב (`created_at DESC, id DESC`).

**המלצה:** עבור חיפוש על פני 100+ מוצרים × 13 ספקים (1,300+ שורות בעת הצמיחה הצפויה) — offset מספיק עד 10K שורות, אחרי זה cursor.

**קישור לפג׳ינציה כבסיס**: סוגיית ה-pagination הכללית כבר צוינה ב-QA-AGENT-14-LOAD-N1.md. **סוכן 51 לא חוזר על הבעיה הכללית**, אלא **מוסיף** שחיפוש ללא pagination הוא מקרה קצה מסוכן במיוחד (מעמיס אפילו יותר מ-list endpoint רגיל, כי query לא דטרמיניסטית).

---

## 5. קומבינציות סינון — אינדקסים Composite

דיימי שצפויים:
1. **"ספקים פעילים + קטגוריה + מיון לפי דירוג"** → צריך `suppliers(active, overall_score DESC)` או composite.
2. **"הזמנות בסטטוס X, ממוינות לפי תאריך"** → `purchase_orders(status, created_at DESC)` — חסר!
3. **"חיפוש מוצר בקטגוריה"** → `supplier_products(category, name)` — חסר composite.
4. **"RFQ recipient של ספק X שענה `quoted`"** → `rfq_recipients(supplier_id, status)` — חסר.

**המלצה:**
```sql
CREATE INDEX idx_po_status_created ON purchase_orders(status, created_at DESC);
CREATE INDEX idx_suppliers_active_score ON suppliers(active, overall_score DESC);
CREATE INDEX idx_sp_cat_name ON supplier_products(category, name);
```

---

## 6. Debouncing בצד לקוח (F-51.06)

**מצב:** אין שום שדה חיפוש בדשבורד (`onyx-dashboard.jsx`). אין `<input type="search">`. אין state של `query`. אין debounce.

אבל צריך להוסיף — **ועם זה להיזהר**:
- `useState('')` + `useEffect(() => fetch, [query])` ישלח fetch על כל הקלדה — כבר 7 fetches עבור "ברזל".
- פתרון: `useDebounce` של 250-350ms, או שימוש ב-`useDeferredValue` (React 18+).

**המלצה:**
```jsx
const [query, setQuery] = useState('');
const deferredQuery = useDeferredValue(query);
useEffect(() => {
  if (deferredQuery.length >= 2) fetchSearch(deferredQuery);
}, [deferredQuery]);
```

**גם ללא debounce**: `setInterval(refresh, 30000)` ב-`onyx-dashboard.jsx:45` כבר דוחף 6 fetches כל 30 שניות. זה לא חיפוש, אבל אם חיפוש ייכנס לאותו `refresh`, המערכת תתחיל להגיב לאט (F-51.07).

---

## 7. Relevance Ranking (F-51.15)

**מצב:** אין, כי אין חיפוש.

**המלצה:** כשיוסיפו full-text, השתמשו ב-`ts_rank`:
```sql
SELECT *,
  ts_rank(to_tsvector('simple', name || ' ' || coalesce(description,'')), plainto_tsquery('simple', $1)) AS rank
FROM supplier_products
WHERE to_tsvector('simple', name || ' ' || coalesce(description,'')) @@ plainto_tsquery('simple', $1)
ORDER BY rank DESC
LIMIT 20;
```

בשילוב `pg_trgm`, אפשר לתת משקל גם ל-similarity score:
```sql
ORDER BY (rank * 0.7 + similarity(name, $1) * 0.3) DESC
```

---

## 8. Empty-search Behavior (F-51.16)

כרגע `GET /api/suppliers/search/:category` **לא מקבל** query ריקה — זו URL path param, אז `/api/suppliers/search/` יחזיר 404 Express.

כשיוסיפו `/api/search?q=`, צריך להחליט:
- `q=` ריק → החזר 20 ראשונים (popular) או 0.
- `q=` פחות מ-2 תווים → החזר `[]` ללא hitting DB (חסכון).
- `q=` מעל 200 תווים → reject (ניסיון DoS).

**המלצה:** validate ב-middleware:
```js
if (!q || q.length < 2) return res.json({ results: [] });
if (q.length > 200) return res.status(400).json({ error: 'Query too long' });
```

---

## 9. Case Sensitivity + קלט משתמש (F-51.03, F-51.17)

`supabase.from(...).eq('category', 'ברזל')` → `WHERE category = 'ברזל'` → case-sensitive, exact match.

אם בקטלוג יש "ברזל" אבל משתמש הקליד "בר" או "ברזל " (רווח בסוף) — לא יימצא.

**כמה מוטחים זה עכשיו:**
- ב-`RFQTab` (`onyx-dashboard.jsx:253`) יש `categories = ["ברזל", ...]` hard-coded, אז לא אמורה להיות בעיה... כל עוד מישהו לא שומר מוצר עם רווח אחורי.
- אבל ב-`server.js:238` — `cats = ... new Set(items.map(i => i.category))` — המשתמש יכול לתת כל string, וגם טעות של רווח אחד תגרום ל-`0 ספקים`.

**המלצה:** normalize ב-INSERT ו-WHERE:
- Server-side: `.trim().toLowerCase()` לפני eq.
- Postgres: עמודה מחושבת (generated column) `category_norm TEXT GENERATED ALWAYS AS (LOWER(TRIM(category))) STORED` עם אינדקס עליה.

---

## 10. Autocomplete Endpoint (F-51.12)

**מצב:** אין.

**המלצה:** `GET /api/suggest?q=br&type=product&limit=10`:
```sql
SELECT id, name, category
FROM supplier_products
WHERE name ILIKE $1 || '%'   -- prefix match מהיר עם btree
LIMIT 10;
```
אינדקס:
```sql
CREATE INDEX idx_products_name_prefix ON supplier_products(name text_pattern_ops);
```

(שים לב: `text_pattern_ops` מאפשר `LIKE 'br%'` מהיר, אבל **לא** `LIKE '%br%'` — לכך צריך pg_trgm.)

---

## 11. URL Params / Filter Persistence (F-51.13)

```jsx
const [tab, setTab] = useState("dashboard");       // state מקומי
const [selectedRfq, setSelectedRfq] = useState(""); // state מקומי
```

אין URL params. רענון דף מאפס הכל. זה לא תקין לאפליקציית ניהול — שיתוף link של "RFQ פתוחים עם דחיפות גבוהה" בלתי אפשרי.

**המלצה:** `useSearchParams` (React Router) או `URLSearchParams` ידנית, עם state sync דו-כיווני.

---

## 12. Saved Searches / Favorite Filters (F-51.14)

**מצב:** אין.

**המלצה (low priority):** עמודה `user_saved_filters` ב-`users` או טבלה נפרדת:
```sql
CREATE TABLE saved_filters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  query JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 13. צד-לקוח: Filter בצד ה-Browser (F-51.05)

הקובץ `onyx-dashboard.jsx` משתמש ב-`Array.filter()` עבור:
- שורה 117: `orders.filter(o => !["closed","cancelled","delivered"].includes(o.status))`
- שורה 125: `rfqs.filter(r => r?.status === "sent" || r?.status === "collecting")`

**הבעיה:** כרגע (13 ספקים, ~20 RFQs) זה מיידי. אבל ברגע שיתקבלו 10K+ records, זה יקרה:
1. fetch של 10K rows (רוחב פס + זמן parse JSON),
2. `.filter()` סינכרוני שחוסם את ה-main thread.

**המלצה:** כל סינון שצפוי להיות "בשבילי הכי חשוב" צריך לעבור ל-backend + אינדקס:
```js
// במקום: orders.filter(o => !["closed","cancelled","delivered"].includes(o.status))
fetch('/api/purchase-orders?active=true&limit=50');
// backend: .not('status', 'in', '(closed,cancelled,delivered)').limit(50)
```

---

## 14. Hebrew-RTL — בעיות ספציפיות

- **Unicode direction marks** (`\u200E`, `\u200F`) נסתרים בתוך שדות — אינדקס ימצא "רשת" אבל query עם LRM ידחה match.
- **ZWJ/ZWNJ** — אותה בעיה.
- **Smart quotes** בעברית: `'` לעומת `׳`, `"` לעומת `״`. המערכת לא normalize.

**המלצה:** לפני INSERT וגם לפני WHERE, העבר דרך פונקציית normalize שתסיר BIDI marks + unify quotes.

---

## 15. Resource Links & Next Steps

### שורות קוד קונקרטיות

| ממצא | קובץ | שורות |
|------|------|-------|
| F-51.01 | `server.js` | 173-185 (`/api/suppliers/search/:category`) |
| F-51.03 | `server.js` | 177 (`.eq('category', ...)`) |
| F-51.05 | `web/onyx-dashboard.jsx` | 117, 125, 250, 257, 349 (`Array.filter` בלקוח) |
| F-51.07 | `web/onyx-dashboard.jsx` | 45 (`setInterval(refresh, 30000)`) |
| F-51.08 | `server.js` | 130, 213, 600, 686 (list endpoints ללא limit/offset) |
| F-51.19 | `001-supabase-schema.sql` | 44-58 (הגדרת supplier_products) |
| F-51.20 | `001-supabase-schema.sql` | 8-40 (suppliers — אין שום index על עמודות search) |

### צעדים מומלצים (לפי עדיפות)

#### P0 — בסיס לחיפוש עתידי
1. `CREATE EXTENSION IF NOT EXISTS pg_trgm;`
2. `CREATE INDEX idx_suppliers_name_trgm ON suppliers USING gin (name gin_trgm_ops);`
3. `CREATE INDEX idx_products_name_trgm ON supplier_products USING gin (name gin_trgm_ops);`
4. Full-text `simple` index על שם+תיאור של מוצר.

#### P1 — API
5. הוסף `GET /api/search?q=&type=supplier|product|order&limit=20&offset=0` עם ILIKE + ts_rank + pagination.
6. Validate `q.length >= 2 && q.length <= 200`.

#### P2 — Dashboard UX
7. הוסף `<input type="search">` עם debounce 300ms.
8. סנכרן state של חיפוש + טאב ל-`URLSearchParams`.

#### P3 — Composite indexes
9. `idx_po_status_created`, `idx_suppliers_active_score`, `idx_sp_cat_name`.

#### P4 — קצוות עברית
10. פונקציית `remove_hebrew_nikud`, נורמליזציית BIDI marks, generated columns.

---

## סיכום

המערכת כרגע **אינה חשופה לשום קריאת חיפוש אמיתית** — אין endpoint, אין UI, אין אינדקסים מתאימים. בסקייל הנוכחי (13 ספקים, 100 מוצרים) זה לא מורגש, אבל **כל ניסיון להוסיף שדה חיפוש בלי תשתית נכונה יגרום**:
1. Sequential scans כבדים (`LIKE '%term%'` בלי trigram),
2. Frontend hangs (filter על-arrays גדולים ב-JS thread),
3. חוסר תמיכת unicode עברי (nikud, direction marks),
4. הצפת DB בגלל היעדר debounce + `setInterval` כל 30 שניות.

**עדיפות: HIGH עבור תשתית (P0-P1), MED עבור UX (P2-P3), LOW עבור edge cases (P4).**

כל ההמלצות עקביות עם QA-AGENT-14 (Load/N+1) אבל ממוקדות חיפוש — ולא משכפלות אותן.

---
*סוכן 51, 2026-04-11 — Static analysis only.*
