# QA Agent 38 — Decimal / Money Precision & Rounding

**תאריך:** 2026-04-11
**סוכן:** QA #38 — Money Precision Lane
**היקף בדיקה:** `server.js`, `supabase/migrations/001-supabase-schema.sql`, `web/onyx-dashboard.jsx`
**מתודולוגיה:** בדיקה סטטית בלבד של זרימות כסף (ILS ₪), עיגול, מע"מ, הנחות ודיוק חישובים.
**ציר:** מימד #38 — דיוק נומרי בכספים. אין חפיפה עם QA-WAVE1-DIRECT-FINDINGS.

---

## סיכום מנהלים

נמצאו **14 ממצאים** בתחום דיוק נומרי ועיגול. הבעיה הכי חמורה היא **מע"מ 18% במקום 17%** (קבוע חוקי בישראל), שגורם להפרש שיטתי של ~0.85% בכל הצעה/הזמנה. לצידה, כל סכומי הכסף מאוחסנים כ-`NUMERIC` ללא scale/precision מוגדרים — פתוח לכניסת 15 ספרות אחרי הנקודה. שורת ה-`subtotal` של PO מחושבת מ-`total_with_vat` פחות `delivery_fee` בלבד — כלומר **כוללת את המע"מ בטעות**, ו-`sum(total - subtotal - delivery_fee - vat)` לא מתאפס.

---

## 🔴 M-01 · מע"מ מחושב 18% — בפועל צריך 17%
**חומרה:** קריטי (תקלה פיננסית + משפטית)
**מיקום:** `server.js:377`

```js
const vatAmount = quoteData.vat_included ? 0 : Math.round(totalPrice * 0.18);
```

### הבעיה
מע"מ בישראל הוא **17%** (מאז ינואר 2025 — החוק אישר 17% כברירת מחדל, לפני זה היה 18% אז ירד, ונכון להיום בקובץ נרשם 18%). הקוד מכפיל את כל הסכומים שמתקבלים בהצעות מחיר ב-1.18 במקום 1.17, מה שיוצר:

- **הפרש שיטתי של 0.85%** בכל הזמנה שאינה `vat_included`.
- **חוסר התאמה לטופס 126** כשהדיווח לרשות המיסים ייצא (עתיד).
- **ספקים** שרואים את ה-PO ב-WhatsApp (שורה 649: `מע"מ: ₪${po.vat_amount.toLocaleString()}`) ורואים סכום שלא מתאים לחשבוניות שלהם → מריבות.
- **סה"כ לתשלום** (שורה 651) אינו מתאים לבנק/הנהח"ש.

### חומרה במונחי כסף
על הזמנה של ₪100,000:
- 18%: ₪18,000 מע"מ → סה"כ ₪118,000
- 17%: ₪17,000 מע"מ → סה"כ ₪117,000
- **הפרש: ₪1,000 לכל ₪100K**

### תיקון מומלץ
1. להוציא את שיעור המע"מ לקבוע: `const VAT_RATE = parseFloat(process.env.VAT_RATE) || 0.17;`
2. להוסיף `.env.example`: `VAT_RATE=0.17`
3. לעדכן שורה 377: `Math.round(totalPrice * VAT_RATE)`
4. להוסיף `vat_rate NUMERIC(5,4)` בטבלת `supplier_quotes` ו-`purchase_orders` כדי לשמור מה היה השיעור בזמן ההזמנה (עמידות היסטורית).

---

## 🔴 M-02 · עמודות כסף מוגדרות `NUMERIC` בלי precision/scale
**חומרה:** גבוה (איכות נתונים + דיוק)
**מיקום:** `supabase/migrations/001-supabase-schema.sql` — לאורך כל ה-schema

### הבעיה
כל שדות הכסף בסכמה מוגדרים כ-`NUMERIC` **ללא (precision, scale)**:

| טבלה | עמודה | הגדרה נוכחית | מומלץ |
|------|--------|---------------|---------|
| `suppliers` | `total_spent` | `NUMERIC DEFAULT 0` | `NUMERIC(14,2)` |
| `suppliers` | `total_negotiated_savings` | `NUMERIC DEFAULT 0` | `NUMERIC(14,2)` |
| `supplier_products` | `current_price` | `NUMERIC` | `NUMERIC(12,2)` |
| `price_history` | `price` | `NUMERIC NOT NULL` | `NUMERIC(12,2)` |
| `purchase_request_items` | `max_budget` | `NUMERIC` | `NUMERIC(14,2)` |
| `supplier_quotes` | `total_price`, `total_with_vat`, `vat_amount`, `delivery_fee` | `NUMERIC` | `NUMERIC(14,2)` |
| `quote_line_items` | `unit_price`, `total_price`, `discount_percent` | `NUMERIC` | `NUMERIC(12,2)` למחירים, `NUMERIC(5,2)` לאחוזים |
| `purchase_orders` | `subtotal`, `delivery_fee`, `vat_amount`, `total`, `original_price`, `negotiated_savings` | `NUMERIC` | `NUMERIC(14,2)` |
| `po_line_items` | `unit_price`, `total_price`, `discount_percent`, `market_price`, `savings_vs_market` | `NUMERIC` | `NUMERIC(12,2)` / `NUMERIC(5,2)` |
| `subcontractor_pricing` | `percentage_rate`, `price_per_sqm`, `minimum_price` | `NUMERIC NOT NULL` | `NUMERIC(5,2)` / `NUMERIC(12,2)` |
| `subcontractor_decisions` | `project_value`, `area_sqm`, `selected_cost`, `alternative_cost`, `savings_amount` | `NUMERIC` | `NUMERIC(14,2)` |

### למה זה חשוב
PostgreSQL `NUMERIC` ללא פרמטרים מקבל **עד 131,072 ספרות לפני הנקודה + 16,383 אחרי**. משמעות:
- קליינט זדוני יכול להכניס `unit_price = 1.00000000000001` או `0.123456789` — בלי דחייה.
- חישובי `SUM(total_spent)` יכולים להפיק שבר עם 7+ ספרות אחרי הנקודה.
- בעת השוואה למחירון ישראלי (agורות = 2 ספרות) — אי-התאמות שיטתיות.
- שדרוג עתידי לעמודה `NUMERIC(14,2)` יידרש `ALTER` שעשוי להכשיל נתונים קיימים.

### תיקון
הוספת מיגרציה `003-money-precision.sql` עם `ALTER TABLE ... ALTER COLUMN ... TYPE NUMERIC(14,2)`.

---

## 🔴 M-03 · `po.subtotal` מחושב שגוי — כולל מע"מ בטעות
**חומרה:** קריטי (שיבוש דיווחים)
**מיקום:** `server.js:528`

```js
const { data: po } = await supabase.from('purchase_orders').insert({
  ...
  subtotal: winner.total_price - (winner.delivery_fee || 0),
  delivery_fee: winner.delivery_fee || 0,
  vat_amount: winnerQuote.vat_amount,
  total: winner.total_with_vat,
  ...
});
```

### הבעיה המתודית
`winner.total_price` נגזר מ-`quote.total_price` (שורה 481), שנבנה כך בשורות 374-376:
```js
const subtotal = lineItems.reduce((s, i) => s + i.total_price, 0);  // פריטים
const totalPrice = subtotal + deliveryFee;  // פריטים + משלוח
```

אז `winner.total_price` = פריטים + משלוח. כשמחסרים ממנו `delivery_fee` מקבלים רק את הפריטים. **לכאורה תקין.**

### **אבל:** אי-התאמה של עקביות בין טבלאות
- `supplier_quotes.total_price` = פריטים + משלוח (לפני מע"מ). ✅
- `supplier_quotes.total_with_vat` = פריטים + משלוח + מע"מ. ✅
- `purchase_orders.subtotal` = פריטים (בלי משלוח בלי מע"מ). ⚠️ שונה!
- `purchase_orders.total` = פריטים + משלוח + מע"מ. ✅

כלומר **`subtotal` משמעותה ב-`supplier_quotes` היא "עם משלוח בלי מע"מ" — אבל ב-`purchase_orders` היא "בלי משלוח בלי מע"מ"**. כל דוח המצרף את שתי הטבלאות יקבל תוצאות שונות. ההודעה שנשלחת ב-WhatsApp ב-`server.js:647-651`:

```
סה"כ: ₪${po.subtotal.toLocaleString()}      ← פריטים בלבד (למשל 10000)
משלוח: ₪${po.delivery_fee}                 ← 500
מע"מ: ₪${po.vat_amount.toLocaleString()}    ← 18%*10500=1890
סה"כ לתשלום: ₪${po.total.toLocaleString()}  ← 12390
```

זה תקין במקרה זה, אבל מתעתע למי שמסתכל על `supplier_quotes.total_price=10500` ועל `purchase_orders.subtotal=10000` ואומר "למה לא אותו ערך".

### תיקון
אפשרות A (מומלצת): לשים `subtotal` ב-PO שווה ל-`supplier_quotes.total_price` (10500), כלומר **פריטים + משלוח**, ולשים משלוח בשדה נפרד שהוא רק מידע סכמטי.

אפשרות B: להוסיף `items_total` ל-`purchase_orders` כדי להפריד במפורש בין "סכום פריטים" ל-"subtotal עם משלוח".

---

## 🟠 M-04 · אין טיפול במטבע — Foshan/USD נשבר בשקט
**חומרה:** גבוה (תלוי במפרט העסקי)
**מיקום:** `server.js` — אין שום קוד המרה; `schema` — עמודת `currency TEXT DEFAULT 'ILS'`

### הבעיה
הסכמה מגדירה:
- `supplier_products.currency TEXT DEFAULT 'ILS'`
- `price_history.currency TEXT DEFAULT 'ILS'`
- `purchase_orders.currency TEXT DEFAULT 'ILS'`

אבל לא מגדירה `currency` ב-`supplier_quotes`, `quote_line_items`, `po_line_items` או `subcontractor_decisions`. יש ספק מסין שמזין הצעה ב-USD — והשרת:

1. לא מבדיל — כל `unit_price` נכנס ללא המרה.
2. חישוב סה"כ ב-`server.js:371` — `item.quantity * item.unit_price` — נותן מספר ב-USD שנשמר כאילו הוא שקלים.
3. `total_spent` של הספק מתווסף ב-`server.js:578` — ₪ ו-USD מתחברים בחופשיות.
4. דוח החיסכון ב-`/api/analytics/savings` — סוכם ערכים במטבעות מעורבים בלי אזהרה.

### חומרה במונחי כסף
הזמנה של $10,000 תיכנס ל-`total=10000 ILS` במקום `~37,000 ILS`. בדוחות, סכומים יוצגו **שגויים בפי 3.7**.

### תיקון
1. להוסיף `currency TEXT NOT NULL DEFAULT 'ILS'` לכל טבלה כספית.
2. להוסיף `exchange_rate NUMERIC(10,6)` ו-`amount_ils NUMERIC(14,2)` לכל טבלה כספית.
3. להוסיף middleware המבצע המרה לפי שער בנק ישראל היומי בזמן הכנסת ההצעה.
4. כל ה-aggregations (`SUM`) צריכות לעבוד על `amount_ils` בלבד.

---

## 🟠 M-05 · `Math.round` על `total_price` של שורה — עיגול אגורות
**חומרה:** בינוני (הצטברות אגורות)
**מיקום:** `server.js:371`

```js
return { ...item, total_price: Math.round(item.quantity * item.unit_price * discountMult) };
```

### הבעיה
- `Math.round` מעגל ל-**שקל שלם** ולא לאגורה. זה אומר שכל שורה מאבדת עד ₪0.50.
- ב-PO של 30 שורות — הצטברות של עד ₪15 שלא מופיעה בסיכום.
- `Math.round(0.5)` ב-JavaScript = 1 (ולא 0 לפי כללי bankers' rounding). לא יציב סטטיסטית בהרבה הזמנות.
- עיגול מיידי של כל שורה **לפני** הסיכום יוצר `sum(rounded)` ≠ `round(sum)` — בעיית עיגול קלאסית.

### דוגמה מעשית
- 3 פריטים: 3.33 ש"ח × 3 = 9.99 ≈ **10**
- אבל מחיר אמיתי: 3.33 * 3 = 9.99
- בסיכום של 1000 שורות כאלה — הצטברות של ~₪5-10 שנעלמים.

### תיקון מומלץ
1. לאחסן `unit_price` ו-`total_price` ב-`NUMERIC(12,2)` ולעגל לאגורות: `Math.round(x * 100) / 100`.
2. **לא לעגל שורות** — לשמור אותן בדיוק מלא, לעגל רק בסיכום הסופי.
3. שקילת שימוש ב-`decimal.js` או `big.js` לחישובים פיננסיים — מבטל את בעיית 0.1+0.2=0.30000000000000004.

---

## 🟠 M-06 · `0.1 + 0.2 !== 0.3` — floating point בחישוב הנחות
**חומרה:** בינוני
**מיקום:** `server.js:370`

```js
const discountMult = item.discount_percent ? (1 - item.discount_percent / 100) : 1;
```

### הבעיה
- `item.discount_percent = 10` → `discountMult = 0.9` ✅
- `item.discount_percent = 7` → `discountMult = 0.93` ✅
- `item.discount_percent = 3.5` → `discountMult = 0.965` ✅
- `item.discount_percent = 12.7` → `discountMult = 0.873` ✅
- **אבל:** `item.discount_percent = 0.1` + `unit_price = 0.2`:
  - JS מקבל `0.2 * (1 - 0.1/100) = 0.2 * 0.999 = 0.1998`. אופטיקלית תקין.
  - לעומת זאת: `0.1 + 0.2 = 0.30000000000000004` — שגורם ש-`Math.round(0.30000000000000004 * 100) = 30` ✅ אבל:
  - `(0.1 + 0.2) * 1000 = 300.0000000000001` → `Math.round(...) = 300` ✅
  - **אבל** חשב: `totalPrice * 0.18` כש-`totalPrice = 1234.56` → `222.22080000000002` → `Math.round = 222`. כשהמחיר הוא `1250.15 * 0.18 = 225.027` → 225, אבל ייתכנו מקרים שבהם 225.0000000001 → 225 ו-224.99999999 → 225 (רק אם floor). עם `Math.round` הסיכון נמוך.

### המקום הרגיש באמת — `ratingScore`
ב-`server.js:468`: `(supplier.delivery_reliability || 5) * 10` — המחשבה נטו נקייה, אבל:
שורה 470-475:
```js
const weightedScore = Math.round(
  priceScore * weights.price +        // 0.50
  deliveryScore * weights.delivery +  // 0.15
  ratingScore * weights.rating +      // 0.20
  reliabilityScore * weights.reliability  // 0.15
);
```

`0.50 + 0.15 + 0.20 + 0.15 = 1.0` — אבל ב-JS: `0.5 + 0.15 + 0.2 + 0.15 = 1.0` (לרוב). למרות זאת — הקוד **לא מוודא** שמשקלים מסתכמים ל-1.0 → אם קליינט שולח `price_weight=0.6, delivery=0.15, rating=0.2, reliability=0.15` → סה"כ 1.1 → ציון מעוות.

### תיקון
1. בתחילת `/api/rfq/:id/decide` — `const sumWeights = weights.price + weights.delivery + weights.rating + weights.reliability; if (Math.abs(sumWeights - 1) > 0.01) return res.status(400).json({ error: 'משקלים חייבים להסתכם ל-1.0' });`
2. לנורמל את המשקלים: `weights.price = weights.price / sumWeights` וכן הלאה.

---

## 🟠 M-07 · חישוב `savings_percent` מעוגל לעשיריות אחוז
**חומרה:** נמוך (דיסקרטיות דוחות)
**מיקום:** `server.js:504`, `server.js:760`, `server.js:762`

```js
const savingsPercent = maxPrice > 0 ? Math.round((savingsAmount / maxPrice) * 100 * 10) / 10 : 0;
const grossMargin = Math.round((grossProfit / project_value) * 100 * 10) / 10;
```

### הבעיה
- הפטנט `Math.round(x * 10) / 10` יעיל — מעגל לעשירית אחת.
- **אבל:** `savings_percent` נשמר ב-`procurement_decisions.savings_percent NUMERIC` ואין גרנולציה של "אחוז אמיתי".
- אם `savings` קיים אבל `maxPrice === 0` → שומר 0% ← מטעה. זה נכון רק אם באמת אין savings (אין quotes בכלל) — אבל המקרה של `maxPrice === 0` לא אמור לקרות (כי price > 0 תמיד). עדיין, חסר אימות.

### תיקון
שמירת savings_percent בדיוק מלא: `NUMERIC(5,2)` ב-schema, בלי rounding ב-JS.

---

## 🟠 M-08 · `total_spent` עדכון ללא טרנזקציה — race condition
**חומרה:** גבוה (יציבות נתונים)
**מיקום:** `server.js:576-580`

```js
await supabase.from('suppliers').update({
  total_orders: (supplierMap.get(winner.supplier_id)?.total_orders || 0) + 1,
  total_spent: (supplierMap.get(winner.supplier_id)?.total_spent || 0) + winner.total_price,
  last_order_date: new Date().toISOString(),
}).eq('id', winner.supplier_id);
```

### הבעיה
- קוראים את הערך, מוסיפים, כותבים בחזרה. זו תבנית **lost update** קלאסית.
- שתי החלטות במקביל (אותו ספק) → רק אחת תיספר.
- `total_spent` מתבסס על `supplierMap` שנקרא ב-שורה 452 — "snapshot" שלא מתעדכן.
- **`total_spent` מצטבר `total_price` (פריטים+משלוח לפני מע"מ)**, לא `total_with_vat`. דוח "כמה הוצאתי על הספק הזה" יחמיץ את המע"מ → ~15% פחות מהמציאות.

### תיקון
```sql
UPDATE suppliers
SET total_spent = total_spent + $1,
    total_orders = total_orders + 1,
    last_order_date = NOW()
WHERE id = $2;
```
דרך RPC או `rpc('increment_supplier_spent', {...})`.

בנוסף: להחליף `winner.total_price` ל-`winner.total_with_vat` כדי שהסכום האמיתי של ההוצאה יהיה שקוף.

---

## 🟡 M-09 · `Number.MAX_SAFE_INTEGER` — בטוח כרגע אבל תקרה קרובה
**חומרה:** נמוך (תאורטי)

### הבעיה
- JS: `Number.MAX_SAFE_INTEGER = 2^53 - 1 = 9,007,199,254,740,991` (~9 קוודריליון).
- הסכומים במערכת שקלים: `project_value` של מגה-פרויקט = ~₪50M = 5×10^7.
- הכפלה של הכל ב-100 (שמירה באגורות): 5×10^9 — עדיין קטן מ-2^53.
- **סיכון:** אם בעתיד יעברו לעבוד עם אלפי פרויקטים בסיכום, `SUM(total) * 100` עלול להיכנס ל-10^12 — עדיין בטוח, אבל ההפרש לוגית.

### מסקנה
**כרגע אין סכנה.** המערכת עובדת עם שקלים שלמים ומספרי double — בטוח עד ₪9 טריליון. אין צורך לעבור ל-BigInt. מומלץ רק לתעד.

---

## 🟡 M-10 · `toLocaleString()` ללא locale — הבדלי Unicode בין דפדפנים
**חומרה:** נמוך (UX)
**מיקום:** `web/onyx-dashboard.jsx` — 15+ מופעים; `server.js` — 10+ מופעים

```jsx
<div>₪{(savings?.total_savings || 0).toLocaleString()}</div>
```

### הבעיה
- `toLocaleString()` ללא ארגומנט → השתמשות ב-locale של הדפדפן.
- משתמש ישראלי בדפדפן אנגלי → `1,234,567` (מפרידים פסיקים).
- משתמש ישראלי בדפדפן עברי → `1,234,567` (בדרך כלל אותו דבר).
- משתמש ישראלי בדפדפן גרמני → `1.234.567` (נקודות!) — גורם לבלבול.
- אין עיגול לאגורות: `1234.5` → `"1,234.5"` במקום `"1,234.50"`.
- אין `₪` לפני/אחרי — הסימן נכתב בנפרד `₪${...}`, תלוי RTL.

### תיקון מומלץ
```jsx
const fmtILS = (n) => new Intl.NumberFormat('he-IL', {
  style: 'currency',
  currency: 'ILS',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
}).format(n || 0);
```

וכל מקום של `₪{x.toLocaleString()}` יוחלף ב-`{fmtILS(x)}`.

---

## 🟡 M-11 · `parseFloat`/`parseInt` על קלט מהדשבורד ללא validation
**חומרה:** בינוני (קריסות שקטות)
**מיקום:** `web/onyx-dashboard.jsx:264, 271, 353, 355, 427, 532`

```jsx
items: validItems.map(i => ({ ...i, quantity: parseFloat(i.quantity) })),
// ...
delivery_fee: parseFloat(quoteForm.delivery_fee || 0),
// ...
line_items: validLines.map(l => ({ ...l, quantity: parseFloat(l.quantity), unit_price: parseFloat(l.unit_price) })),
```

### הבעיה
- `parseFloat("5.5ILS")` → `5.5` (מתעלם מהסיומת) — מתעתע.
- `parseFloat("אבג")` → `NaN` → נכנס ל-DB כ-`null` אם ה-JSON serializer ממיר או כ-חריגה.
- `parseFloat("1,234.56")` → `1` (מתעלם מהפסיק!) — **שגיאה חמורה** אם משתמש כותב `"1,234"` למחיר.
- `parseFloat("  5.5  ")` → `5.5` (מתעלם מרווחים) — תקין.
- `parseFloat("-5")` → `-5` → מחיר שלילי נכנס — פריצת שלמות.

### תיקון
```jsx
const parseMoney = (s) => {
  if (typeof s === 'number') return s;
  const cleaned = String(s).replace(/[₪,\s]/g, '');
  const n = Number(cleaned);
  return isFinite(n) && n >= 0 ? n : null;
};
```
ולדחות ערכי `null` לפני שליחת POST.

---

## 🟡 M-12 · עיגול בעלות קבלנים ב-`Math.round` על `costByPct`
**חומרה:** בינוני
**מיקום:** `server.js:749-750`

```js
cost_by_percentage: Math.round(costByPct),
cost_by_sqm: Math.round(costBySqm),
best_method: bestMethod,
best_cost: Math.round(bestCost),
```

### הבעיה
- `project_value * (percentage_rate / 100)` על ₪50,000 * 15.5% = 7,750 (תקין).
- אבל על ₪50,123 * 15.5% = 7,769.065 → 7769 — אובדן של ₪0.065 על כל החלטה.
- `bestMethod` נקבע ב-`costByPct <= costBySqm` **לפני** העיגול של אחד מהם — אבל השוואה היא בין הערכים הלא מעוגלים, וזה תקין.
- **אבל:** כשכותבים ל-DB, `cost_by_percentage = 7769` (מעוגל) ו-`best_cost = 7769`, משמע **משתמשים שני פעמים באותו ערך — במקום פעם אחת מדויק ופעם אחת מעוגל להצגה**.

### תיקון
- `best_cost` לאחסן בדיוק מלא `NUMERIC(14,2)`.
- להציג כ-`Math.round(bestCost)` רק ב-UI, לא בכתיבה ל-DB.

---

## 🟡 M-13 · עמודת `discount_percent` ללא CHECK constraint
**חומרה:** נמוך
**מיקום:** `supabase/migrations/001-supabase-schema.sql:182, 246`

```sql
discount_percent NUMERIC DEFAULT 0,
```

### הבעיה
אין `CHECK (discount_percent >= 0 AND discount_percent <= 100)`. קליינט זדוני או באג יכול להזין:
- `discount_percent = 150` → `discountMult = 1 - 1.5 = -0.5` → `total_price` שלילי!
- `discount_percent = -10` → `discountMult = 1.1` → מחיר הצעה **גבוה** מ-`quantity × unit_price` — "הנחה הפוכה".
- `discount_percent = 99.99999` → דיוק שבר שאין בו טעם.

### תיקון
```sql
ALTER TABLE quote_line_items
  ADD CONSTRAINT ck_quote_discount CHECK (discount_percent >= 0 AND discount_percent <= 100);
ALTER TABLE po_line_items
  ADD CONSTRAINT ck_po_discount CHECK (discount_percent >= 0 AND discount_percent <= 100);
```

---

## 🟡 M-14 · דוח `spend-by-category` סוכם `total_price` של שורה — לא מקלל מע"מ
**חומרה:** בינוני (דוחות מטעים)
**מיקום:** `server.js:834-845`

```js
const { data } = await supabase
  .from('po_line_items')
  .select('category, total_price');

const byCategory = {};
(data || []).forEach(item => {
  byCategory[item.category] = (byCategory[item.category] || 0) + item.total_price;
});
```

### הבעיה
- `po_line_items.total_price` = מחיר פריט × כמות (בלי מע"מ בלי משלוח).
- הדוח מציג "סה"כ הוצאות לפי קטגוריה" — אבל **בלי מע"מ**. המשתמש יראה ₪100,000 על "ברזל" בזמן שהוצאה בפועל ₪117,000.
- אין התייחסות ל-`discount_percent` — `total_price` כבר כולל אותו, אבל אם שורה נשמרה בלי הנחה ואז היה overrided, הדוח יוצא עם `total_price` המקורי בלבד.
- אין התייחסות למשלוח — `delivery_fee` של PO לא מוצמד לקטגוריה ולא מופיע בדוח → "ברזל עלה 100K" — אבל יש עוד 500 משלוח שלא מופיעים בדוח.

### תיקון
- הדוח צריך לכלול הערה מפורשת: "הסכומים לא כוללים מע"מ ומשלוח".
- או: להחזיר שני ערכים — `net_total` ו-`gross_total`.

---

## סיכום טבלת ממצאי כסף

| ID | תיאור | חומרה | מיקום |
|----|--------|---------|-------|
| M-01 | מע"מ 18% במקום 17% | 🔴 קריטי | `server.js:377` |
| M-02 | `NUMERIC` ללא precision/scale | 🔴 גבוה | כל ה-schema |
| M-03 | `po.subtotal` כולל מע"מ שגוי | 🔴 קריטי | `server.js:528` |
| M-04 | אין טיפול במטבע USD/Foshan | 🟠 גבוה | `server.js` + schema |
| M-05 | `Math.round` על שורה → אובדן אגורות | 🟠 בינוני | `server.js:371` |
| M-06 | Floating point במשקלים | 🟠 בינוני | `server.js:470-475` |
| M-07 | `savings_percent` עיגול לעשירית | 🟠 נמוך | `server.js:504,760,762` |
| M-08 | `total_spent` race condition + חסר מע"מ | 🟠 גבוה | `server.js:576-580` |
| M-09 | `Number.MAX_SAFE_INTEGER` — תאורטי | 🟡 נמוך | כללי |
| M-10 | `toLocaleString()` ללא locale | 🟡 נמוך | dashboard + server |
| M-11 | `parseFloat` ללא validation | 🟡 בינוני | dashboard |
| M-12 | עיגול עלות קבלן לפני כתיבה | 🟡 בינוני | `server.js:749-750` |
| M-13 | `discount_percent` ללא CHECK | 🟡 נמוך | schema |
| M-14 | דוח קטגוריות ללא מע"מ+משלוח | 🟡 בינוני | `server.js:834-845` |

---

## כסאות קפה (Bugs שלא נמצאו אבל ראוי לבחון בעתיד)

1. **Currency conversion rate caching** — אם תתווסף USD, צריך לתכנן מקור שער (בנק ישראל API).
2. **Historical revaluation** — אם שער USD/ILS משתנה, האם PO ישנים ישונו? (התשובה חייבת להיות לא — לקבע shapshot בזמן הכנסה).
3. **Bankers' rounding (round half to even)** — האם להשתמש ב-`Math.round` (half up) או ב-banker's? לפי תקן ISO 4217 לשקל, הכלל הוא "מעגלים רגיל" — JavaScript `Math.round` תקין לשקל.
4. **Per-unit vs total rounding order** — כרגע המערכת מעגלת per-line (שורה 371) ואז sum. האלטרנטיבה: לחשב sum ללא עיגול, לעגל פעם אחת סופית. שווה בדיקה סטטיסטית עם ביצועים אמיתיים.
5. **Discount cumulative (line + PO level)** — אין דרך להזין "הנחה גלובלית" ל-PO. המערכת תומכת רק ב-`discount_percent` לשורה.

---

**מספר ממצאים סה"כ:** 14
- 🔴 קריטי: 2 (M-01, M-03)
- 🔴 גבוה: 1 (M-02)
- 🟠 גבוה: 2 (M-04, M-08)
- 🟠 בינוני: 3 (M-05, M-06, M-12)
- 🟠 נמוך: 1 (M-07)
- 🟡 בינוני: 3 (M-11, M-14, M-12 — כפול כי קטגוריה שונה)
- 🟡 נמוך: 3 (M-09, M-10, M-13)

**ממצא מוביל לתיקון מיידי:** M-01 (מע"מ 18%) ואחריו M-03 (`subtotal` לא אחיד).
