# QA Agent 08 — תוכנית בדיקות יחידה (Unit Test Plan)

**מערכת:** ONYX Procurement
**קבצי מקור:**
- `onyx-procurement/server.js` (934 שורות)
- `onyx-procurement/web/onyx-dashboard.jsx` (710 שורות)

**תאריך:** 2026-04-11
**סוכן:** QA Agent 08 — Unit Test Specialist
**סטטוס:** ניתוח סטטי בלבד (ללא שינוי קוד, ללא הרצה)

---

## מבוא

המסמך מכיל תוכנית בדיקות יחידה עבור הלוגיקה העסקית הטהורה (pure business logic) של מערכת ONYX. הבדיקות מתמקדות בפונקציות קריטיות שמבצעות חישובים מספריים, פילטרים, וניקוד (scoring), ולא במסד הנתונים או ברשת. סה"כ ~42 מקרי בדיקה קריטיים המחולקים ל-5 אזורים, פלוס רשימה של באגים שהתגלו בניתוח הסטטי.

---

## 1. פונקציית ניקוד משוקלל — `/api/rfq/:id/decide`

**מיקום:** `server.js` שורות 425-593
**סוג:** חישוב טהור — מקבל מערך הצעות + ספקים + משקלות, מחזיר ספק זוכה.

### חוזה (Contract)

**קלט:**
- `quotes[]` — מערך של `{ id, total_price, delivery_days, supplier_id, ... }`
- `suppliers[]` — מערך של `{ id, rating, delivery_reliability }`
- משקלות: `{ price, delivery, rating, reliability }` (ברירת מחדל: 0.50, 0.15, 0.20, 0.15)

**פלט:**
- `scored[]` מסודר יורד לפי `weighted_score`
- `winner` = `scored[0]`
- `savingsAmount = maxPrice - winner.total_price`
- `savingsPercent` (אחוז מול ההצעה היקרה)

**נוסחאות:**
```
priceScore       = ((maxPrice - total_price) / priceRange) * 100
deliveryScore    = max(0, 100 - (delivery_days / maxDelivery) * 100)
ratingScore      = (rating || 5) * 10
reliabilityScore = (delivery_reliability || 5) * 10
weightedScore    = round(price*wP + delivery*wD + rating*wR + reliability*wRel)
```

### טבלת מקרי בדיקה

| # | תיאור | קלט | פלט צפוי | הגיון |
|---|-------|------|----------|-------|
| 1.1 | הצעה בודדת | 1 quote, price=1000, delivery=5 | priceScore=0 (max=min), deliveryScore=0 (max=quote), winner=quote יחיד | שימוש ב-`priceRange || 1` מונע חלוקה באפס |
| 1.2 | שתי הצעות, זולה מנצחת | A=1000/7d, B=1500/5d, משקל 50/15/20/15 | A.priceScore=100, B.priceScore=0, A נבחר (מחיר דומיננטי) | 50% משקל למחיר מכריע |
| 1.3 | שתי הצעות, דחופה מנצחת | A=1000/30d, B=1200/2d, price_weight=0.1, delivery_weight=0.6 | B נבחר — משקל אספקה הופך את התוצאה | ניתן לבדוק override של משקלות |
| 1.4 | כל ההצעות בתיקו מחיר (min=max) | A=1000, B=1000, C=1000 | priceRange=1 (fallback), כולם קיבלו priceScore=0 | `priceRange = maxPrice - minPrice \|\| 1` |
| 1.5 | 3 הצעות שוות לחלוטין | 3 × {1000, 5d, rating=8} | כולם עם אותו score, winner=הראשון אחרי sort יציב | בדיקת יציבות מיון |
| 1.6 | משקלות שליליים | price_weight=-0.5 | score שלילי — עדיין מתבצע, הערך הגבוה (הכי פחות שלילי) מנצח | **באג פוטנציאלי:** אין ולידציה שהמשקלות חיוביים |
| 1.7 | חסרות דירוג ספק (`supplier.rating` undefined) | supplier=`{}` | ratingScore = 5 * 10 = 50 (ברירת מחדל) | שורה 467: `(supplier.rating \|\| 5) * 10` |
| 1.8 | ספק לא קיים במפה | supplier_id לא ב-suppliers | supplier={}, rating=50, reliability=50 | שורה 463: `\|\| {}` |
| 1.9 | קלט NaN ב-total_price | quote.total_price=NaN | maxPrice=NaN, כל ה-scores=NaN, winner לא מוגדר | **באג:** אין בדיקת NaN; כל המיון נהרס |
| 1.10 | מחיר 0 בכל ההצעות | כולם total_price=0 | priceRange=1, savingsPercent: `maxPrice>0 ? ... : 0` = 0 | שורה 504 מטפלת בכך |
| 1.11 | delivery_days=0 | A=1000/0d | maxDelivery=max(...,1)=1, deliveryScore=100 | שורה 459: `max(..., 1)` מונע חלוקה באפס |
| 1.12 | ההצעה היקרה הכי מהירה | A=2000/1d, B=1000/10d, משקל 30/60/5/5 | A אמור לנצח בזכות אספקה (score 0 במחיר אבל 100 באספקה) | מאמת חישוב deliveryScore |
| 1.13 | 5 הצעות, savingsPercent | min=800, max=1000 | savings=200, percent=20.0 | שורה 504: `round(... * 10) / 10` |
| 1.14 | הצעה ריקה (quotes=[]) | `quotes=[]` | 400 + "אין הצעות מחיר — לא ניתן לקבל החלטה" | שורה 443 guard |
| 1.15 | רייטינג = 10 מול רייטינג חסר | A.rating=10, B.rating=undefined | A=100, B=50 (fallback) — **אי-צדק!** הייחוס לחסרי רייטינג צריך להיות null/skip | **הצעת שיפור:** לתת 0 או לא לכלול במשקל |

**סה"כ: 15 מקרי בדיקה**

---

## 2. החלטת קבלן משנה — `/api/subcontractors/decide`

**מיקום:** `server.js` שורות 712-798
**סוג:** השוואה בין שתי שיטות תמחור (אחוזים vs מ"ר), בחירת הזולה יותר לכל מועמד.

### חוזה (Contract)

**קלט:**
- `work_type` (enum)
- `project_value`, `area_sqm` (מספרים)
- `pricingData[]` — מערך של `{ percentage_rate, price_per_sqm, minimum_price, subcontractors }`
- משקלות: `{ price, quality, reliability }` (ברירת מחדל: 0.6, 0.25, 0.15)

**פלט:**
- `candidates[]` עם `best_method`, `best_cost`, `final_score`
- `winner`, `savings`, `grossProfit`, `grossMargin`

**נוסחאות:**
```
costByPct = project_value * (percentage_rate / 100)
costBySqm = area_sqm * price_per_sqm
if minimum_price: both = max(both, minimum_price)
bestCost = min(costByPct, costBySqm)
maxCost = max(project_value * 0.5, area_sqm * 1000)
priceScore = max(0, 100 - (bestCost / maxCost) * 100)
```

### טבלת מקרי בדיקה

| # | תיאור | קלט | פלט צפוי | הגיון |
|---|-------|------|----------|-------|
| 2.1 | אחוזים זול יותר | project_value=100000, area=50, pct=10%, sqm=500 | costByPct=10000, costBySqm=25000, bestMethod='percentage' | 10%×100K < 50×500 |
| 2.2 | מ"ר זול יותר | project_value=100000, area=10, pct=20%, sqm=500 | costByPct=20000, costBySqm=5000, bestMethod='per_sqm' | 20%×100K > 10×500 |
| 2.3 | מינימום מחיר דורס את שניהם | pct=5000, sqm=3000, min_price=10000 | costByPct=10000, costBySqm=10000, tie → 'percentage' (`<=`) | שורה 735: `Math.max(cost, minimum_price)` |
| 2.4 | area_sqm=0 | area=0, sqm_rate=500 | costBySqm=0 → תמיד מנצח את pct → bestMethod='per_sqm' | **באג פוטנציאלי:** אספקה חינם-למעשה; אין guard |
| 2.5 | project_value=0 | project_value=0, pct=10% | costByPct=0 → מנצח, bestMethod='percentage', grossMargin = `round((0/0)*100*10)/10 = NaN` | **באג בשורה 762:** חלוקה באפס ב-grossMargin |
| 2.6 | סט pricing ריק (אין קבלנים ל-work_type) | pricingData=[] | 400 + "אין קבלנים ל-{work_type}" | שורה 725 guard |
| 2.7 | קבלנים קיימים אך לא זמינים | כולם `available=false` | 400 + "אין קבלנים זמינים" | שורה 728 guard |
| 2.8 | קבלן יחיד | 1 candidate | winner=היחיד, savings=alternativeCost-bestCost (יכול להיות 0) | savingsPercent = 0 אם alternativeCost=0 |
| 2.9 | 3 קבלנים עם איכות שונה | A (איכות 10), B (איכות 5), C (איכות 1), אותם מחירים | A מנצח בזכות quality_weight | בדיקת משקל איכות |
| 2.10 | bestCost > maxCost | bestCost=500000, maxCost=100000 | priceScore = `max(0, -400)` = 0 | שורה 741: max(0, ...) מונע שלילי |
| 2.11 | minimum_price = null/0 | min_price=0 (falsy) | if נופל, לא מדרוס | שורה 735: `if (p.minimum_price)` |
| 2.12 | NaN ב-percentage_rate | pct=undefined | costByPct=NaN, bestCost=NaN | **באג:** אין ולידציה, `Math.min(NaN, x)=NaN` |
| 2.13 | savingsPercent עם alternativeCost=0 | both cost = 0 | `alternativeCost > 0 ? ... : 0` = 0 | שורה 760 guard |
| 2.14 | subcontractors=null ברשומת pricing | `p.subcontractors=null` | `filter` מסיר כי `?.available` הוא undefined = falsy | שורה 727 guard |
| 2.15 | איכות ואמינות NaN | quality_rating=NaN | qualityScore=NaN → finalScore=NaN | **באג:** אין נרמול |

**סה"כ: 15 מקרי בדיקה**

---

## 3. חישוב סכומי הצעה — `/api/quotes`

**מיקום:** `server.js` שורות 365-418
**סוג:** חישוב אריתמטי טהור של שורות הצעה.

### חוזה (Contract)

**קלט:**
- `line_items[]` — `{ quantity, unit_price, discount_percent }`
- `quoteData` — `{ free_delivery, delivery_fee, vat_included }`

**פלט:**
- `total_price` (subtotal + delivery)
- `vat_amount` (0 אם vat_included, אחרת 18%)
- `total_with_vat`

**נוסחאות:**
```
discountMult = discount_percent ? (1 - pct/100) : 1
item.total_price = round(quantity * unit_price * discountMult)
subtotal = sum(item.total_price)
deliveryFee = free_delivery ? 0 : (delivery_fee || 0)
totalPrice = subtotal + deliveryFee
vatAmount = vat_included ? 0 : round(totalPrice * 0.18)
totalWithVat = totalPrice + vatAmount
```

### טבלת מקרי בדיקה

| # | תיאור | קלט | פלט צפוי | הגיון |
|---|-------|------|----------|-------|
| 3.1 | פריט בודד ללא הנחה | qty=10, price=100, disc=0 | item=1000, total=1000, vat=180, vatTotal=1180 | `discount_percent=0` falsy → mult=1 (נכון) |
| 3.2 | הנחה 100% | qty=10, price=100, disc=100 | item=0, total=0, vat=0 | mult=0 |
| 3.3 | הנחה 50% | qty=10, price=100, disc=50 | item=500 | `round(10*100*0.5)=500` |
| 3.4 | כלול מע"מ (vat_included=true) | subtotal=1000 | vatAmount=0, totalWithVat=1000 | שורה 377 |
| 3.5 | לא כלול מע"מ | subtotal=1000 | vat=180, totalWithVat=1180 | `round(1000*0.18)` |
| 3.6 | משלוח חינם | fee=50, free=true | deliveryFee=0 | שורה 375 |
| 3.7 | לא חינם אבל fee=undefined | free=false, fee=undefined | deliveryFee=0 (fallback) | `delivery_fee \|\| 0` |
| 3.8 | רשימת פריטים ריקה | line_items=[] | subtotal=0, total=deliveryFee, vat=round(fee*0.18) | `reduce` מחזיר 0 |
| 3.9 | line_items=undefined | `{...quoteData}` ללא line_items | `(undefined \|\| [])` = [] | שורה 369 guard |
| 3.10 | עיגול הנחה לא עגולה | qty=3, price=33.33, disc=10 | `round(3*33.33*0.9)=90` | בדיקת Math.round |
| 3.11 | מע"מ עגול | subtotal=1000 (lookup) או 1001 | vat=180 או 180 (`round(180.18)=180`) | אימות `Math.round` |
| 3.12 | הנחה שלילית | disc=-10 | mult=1.1 → item גדל ב-10% | **באג פוטנציאלי:** אין ולידציה של טווח 0-100 |
| 3.13 | מחיר שלילי | price=-100 | item שלילי, subtotal שלילי, vat שלילי | **באג:** אין guard על מחירים שליליים |
| 3.14 | free_delivery אך delivery_fee=100 | free=true, fee=100 | deliveryFee=0 (free חזק יותר) | שורה 375 תקינה |

**סה"כ: 14 מקרי בדיקה** (נגזל ל-10-12 בפועל אם מאגדים 3.1/3.2/3.3)

---

## 4. Audit Logging — `audit()`

**מיקום:** `server.js` שורות 99-105
**סוג:** helper שכותב שורה לטבלת `audit_log`.

### חוזה (Contract)

**חתימה:** `audit(entityType, entityId, action, actor, detail, prev, next)`
**פלט:** `Promise<void>` (לא מחזיר דבר)
**תופעות לוואי:** הוספת שורה לטבלה עם 7 שדות

### טבלת מקרי בדיקה

| # | תיאור | קלט | פלט צפוי | הגיון |
|---|-------|------|----------|-------|
| 4.1 | קריאה סטנדרטית | audit('quote', 'q1', 'received', 'Kobi', 'desc', null, {x:1}) | שורה בטבלה עם 7 שדות נכונים | ברירת מחדל |
| 4.2 | פרמטרים חסרים (prev/next) | audit('rfq', 'r1', 'sent', 'AI') | prev=undefined, next=undefined — Supabase מקבל undefined כ-null | mock של `supabase.from().insert()` מאמת קריאה |
| 4.3 | שגיאה במסד | mock שמחזיר `{ error }` | הפונקציה לא זורקת (no await check) | **באג:** שגיאות אודיט נבלעות — אין error handling |
| 4.4 | כל ה-endpoints שקוראים audit | grep `audit(` ב-server.js | כל endpoint שמעדכן state חייב לקרוא audit | בדיקה סטטית: quotes, decide, approve, send |

**מימוש המלצה:** שימוש ב-`jest.mock('@supabase/supabase-js')` + spy על `supabase.from('audit_log').insert` + assertion על `toHaveBeenCalledWith(...)`.

**סה"כ: 4 מקרי בדיקה**

---

## 5. חישובי Dashboard (Frontend)

**מיקום:** `onyx-dashboard.jsx`
**סוג:** פילטרים ופונקציות lookup טהורות ב-React.

### 5.1 `activeOrders` — שורה 117

**חוזה:** `orders.filter(o => !["closed", "cancelled", "delivered"].includes(o.status)).length`

| # | תיאור | קלט | פלט צפוי | הגיון |
|---|-------|------|----------|-------|
| 5.1.1 | הזמנה פעילה (draft) | [{status:'draft'}] | 1 | draft לא ב-blacklist |
| 5.1.2 | הזמנה שנסגרה | [{status:'closed'}] | 0 | ב-blacklist |
| 5.1.3 | תערובת | draft, sent, delivered, cancelled | 2 (draft+sent) | רק 2 פעילות |
| 5.1.4 | רשימה ריקה | [] | 0 | filter טריוויאלי |
| 5.1.5 | status=null | [{status:null}] | 1 (`!includes(null)=true`) | **באג פוטנציאלי:** נחשב כפעיל |
| 5.1.6 | status עם רווחים | [{status:' closed '}] | 1 (לא מדויק!) | **באג:** אין trim |

### 5.2 `workTypes` — שורה 527

**חוזה:** קבוע enum של 7 סוגי עבודה.

| # | תיאור | בדיקה |
|---|-------|-------|
| 5.2.1 | אורך המערך | `workTypes.length === 7` |
| 5.2.2 | תכולה מדויקת | includes 'מעקות_ברזל', 'מעקות_אלומיניום', 'שערים', 'גדרות', 'פרגולות', 'התקנה', 'צביעה' |
| 5.2.3 | סנכרון עם backend | בדיקה סטטית: האם backend מקבל את אותם ערכים? | **באג:** אין validation ב-backend; work_type הוא string חופשי |

### 5.3 `statusColors` — שורה 452

**חוזה:** lookup object של 8 סטטוסים → צבעי hex.

| # | תיאור | קלט | פלט צפוי |
|---|-------|------|----------|
| 5.3.1 | סטטוס ידוע | 'draft' | '#71717a' |
| 5.3.2 | סטטוס לא ידוע | 'unknown' | fallback '#71717a' (שורה 466: `\|\| "#71717a"`) |
| 5.3.3 | סטטוס undefined | undefined | fallback |
| 5.3.4 | כל 8 המפתחות קיימים | — | draft/pending_approval/approved/sent/confirmed/delivered/closed/cancelled |
| 5.3.5 | סנכרון עם backend enum | הסטטוסים במערכת שוים לאלה ב-DB | **בדיקה סטטית** |

**סה"כ: 14 מקרי בדיקה (5.1 = 6, 5.2 = 3, 5.3 = 5)**

---

## באגים שהתגלו בניתוח סטטי

| # | חומרה | קובץ:שורה | תיאור | המלצה |
|---|-------|-----------|--------|--------|
| B1 | **CRITICAL** | `server.js:762` | חלוקה באפס ב-`grossMargin = round((grossProfit / project_value) * 100 * 10) / 10` כאשר `project_value=0` | הוסף guard: `project_value > 0 ? ... : 0` |
| B2 | HIGH | `server.js:465-475` | `priceScore/deliveryScore` מחושבים עם `NaN` כאשר `total_price` או `delivery_days` חסרים — `Math.max/Math.min` מחזירים `NaN` ומשבשים את כל הניקוד | הוסף סינון `quotes.filter(q => Number.isFinite(q.total_price))` בתחילת הפונקציה |
| B3 | HIGH | `server.js:104` | `audit()` לא מטפל בשגיאות מ-Supabase — `insert` יכול להיכשל ב-silence. אין try/catch ואין ערך החזרה | החזר את ה-error ולוג אותו (לפחות `console.error`) |
| B4 | MEDIUM | `server.js:427-435` | אין ולידציה שהמשקלות חיוביים ומסתכמים ל-1. משקל שלילי ייתן ציון שלילי תקין מבחינת JS | הוסף validator: `Math.max(0, w)` + normalize לסך 1 |
| B5 | MEDIUM | `server.js:734` | `costBySqm = area_sqm * price_per_sqm` — כאשר `area_sqm=0`, העלות היא 0 ותמיד מנצחת. יוצר החלטה שגויה (קבלן מקבל 0₪) | הוסף guard `if (area_sqm <= 0) skip per_sqm method` |
| B6 | MEDIUM | `server.js:370` | `discount_percent` מקבל כל ערך — שלילי (מעלה מחיר) או >100 (מחיר שלילי) | הוסף clamp `Math.max(0, Math.min(100, disc))` |
| B7 | MEDIUM | `server.js:467` | רייטינג חסר מקבל ערך ברירת מחדל 5 (50 נקודות) — אי-צדק מול ספק עם רייטינג מדויק. ספק חדש נהנה יותר מספק עם 4/10 | השאר null או קבל מההיסטוריה |
| B8 | LOW | `onyx-dashboard.jsx:117` | `activeOrders` לא מכיל trim/normalize — `' closed '` ייחשב פעיל | נרמל את ה-status |
| B9 | LOW | `onyx-dashboard.jsx:527` vs backend | הרשימה `workTypes` מוגדרת ב-frontend בלבד — backend מקבל כל string ב-`work_type` | הגדר enum במקום אחד (schema share) |
| B10 | LOW | `server.js:378` | `round(totalPrice * 0.18)` — שגיאת עיגול של ש"ח אחד בסכומים בינוניים. הבנק מצפה ל-`Math.round` של `totalPrice * 17` / 100? לא קריטי | הצהרה ברורה על שיטת עיגול |
| B11 | LOW | `server.js:459` | `Math.max(...delivery_days, 1)` — אם כל ה-delivery_days חסרים/NaN, maxDelivery=NaN | סינון `.filter(Number.isFinite)` |
| B12 | INFO | `server.js:533` | `new Date(Date.now() + winner.delivery_days * 86400000)` — לא מתחשב ב-timezone, סוף שבוע או חגים | לא קריטי, אבל צריך לציין בתיעוד |

---

## סדר עדיפויות

### Phase 1 — קריטי (עד שבוע)
1. **B1** — תיקון חלוקה באפס ב-grossMargin (`subcontractors/decide`)
2. **B2** — סינון NaN ב-quotes לפני scoring (`rfq/decide`)
3. **B3** — טיפול בשגיאות audit
4. **1.1-1.3, 1.11, 1.14** — בדיקות לזרימת "happy path" + guards קיימים
5. **2.1-2.3, 2.6-2.7** — בדיקות subcontractor decide
6. **3.1, 3.4, 3.5, 3.9** — בדיקות חישוב הצעה בסיסיות

### Phase 2 — חשוב (שבועיים)
7. **B4, B5, B6, B7** — ולידציות קלט
8. **1.4, 1.5, 1.9, 1.15** — מקרי קצה בניקוד RFQ
9. **2.4, 2.5, 2.12, 2.15** — מקרי קצה בניקוד קבלנים
10. **3.2, 3.3, 3.8, 3.12, 3.13** — מקרי קצה בחישוב הצעות
11. **4.1-4.4** — audit log coverage

### Phase 3 — שיפור איכות (חודש)
12. **B8, B9, B10** — נורמליזציה ו-schema sharing
13. **5.1-5.3** — בדיקות dashboard

---

## סיכום סטטיסטי

| אזור | מקרי בדיקה | באגים נמצאו |
|------|------------|--------------|
| 1. RFQ Decide (scoring) | 15 | 3 (B2, B4, B7) |
| 2. Subcontractor Decide | 15 | 4 (B1, B5, ועוד) |
| 3. Quote Totals | 14 | 2 (B6, B10) |
| 4. Audit | 4 | 1 (B3) |
| 5. Dashboard | 14 | 2 (B8, B9) |
| **סה"כ** | **62** | **12** |

**המלצה:** להתחיל במימוש Phase 1 (≈20 בדיקות) שמכסות את 3 הבאגים הקריטיים + ה-happy paths. Jest + Supertest + mock של `@supabase/supabase-js` = כיסוי של >80% מהלוגיקה העסקית תוך יום עבודה.

---

**סוכן 08 — סיום דוח**
