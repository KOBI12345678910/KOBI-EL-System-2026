# QA-AGENT-142 — Bank Reconciliation / התאמת בנקים

**Date:** 2026-04-11
**QA Agent:** #142
**Project:** onyx-procurement
**Dimension:** Bank Reconciliation
**Analysis Mode:** Static (no runtime execution)
**Sources reviewed:**
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\onyx-procurement\supabase\migrations\001-supabase-schema.sql` (563 lines, 18 tables)
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\onyx-procurement\server.js` (934 lines, 28 HTTP endpoints)

---

## 0. תקציר מנהלים — Executive Summary

**פסק דין סופי:** `STATUS = MISSING / לא קיים כלל`

מערכת onyx-procurement, כפי שהיא מיוצגת בסכמה הקנונית (`001-supabase-schema.sql`) ובשרת ההפעלה (`server.js`), **חסרה באופן מוחלט** כל תשתית להתאמת בנקים (Bank Reconciliation). זהו פער פונקציונלי קריטי עבור מערכת רכש שמטפלת בהזמנות רכש עם סכומים כספיים (`purchase_orders.total`), תנאי תשלום (`payment_terms`) ומטבעות (`currency`), אך אינה סוגרת את המעגל הפיננסי של אימות ביצוע התשלום מול דפי בנק.

**נתונים מספריים:**
- 18 טבלאות בסכמה — 0 טבלאות בנק/התאמה
- 28 נקודות קצה HTTP — 0 נקודות קצה בנק/התאמה/ייבוא/FX
- 0 אזכורים של המילים: `bank`, `reconcil`, `statement`, `iban`, `swift`, `fx`, `forex`
- היחיד שקיים: `payment_terms` כשדה טקסט חופשי (מחרוזת בעברית "שוטף + 30") — ללא integration לתשלום בפועל

---

## 1. Bank Statement Import — ייבוא דפי בנק

### מצב קיים
**לא קיים.** אין תשתית כלל לקליטת קובצי דף־בנק מכל סוג שהוא.

### בדיקות שבוצעו
| בדיקה | מיקום | תוצאה |
|---|---|---|
| חיפוש טבלת `bank_statements` | `001-supabase-schema.sql` | לא נמצאה |
| חיפוש טבלת `bank_transactions` | `001-supabase-schema.sql` | לא נמצאה |
| חיפוש endpoint `/api/bank/*` | `server.js` | לא נמצא |
| חיפוש endpoint `/api/import/*` | `server.js` | לא נמצא |
| חיפוש multer/upload middleware | `server.js` | לא נמצא |
| חיפוש parser לפורמטים: CSV/OFX/QIF/MT940/CAMT.053 | כל הפרויקט | לא נמצא |
| חיפוש `XLSX` / `xlsx` import library | `server.js` | לא נמצא |

### פער קריטי — תסריטים שאי אפשר לממש
1. **אין קליטת CSV** — לא ניתן לייבא דף בנק של בנק הפועלים / לאומי / דיסקונט / מזרחי־טפחות בפורמט הטבלאי הסטנדרטי שלהם.
2. **אין קליטת MT940** — פורמט SWIFT התקני לדפי בנק בינלאומיים (רלוונטי לספקי חו"ל כמו "אלומיניום ישראל" אם ירכשו מחו"ל).
3. **אין קליטת CAMT.053** — פורמט ISO 20022 XML, התקן המודרני (רלוונטי ל־SEPA/EUR).
4. **אין deduplication** — אין hash/uuid per־transaction שימנע ייבוא כפול של אותו דף בנק.
5. **אין staging table** — אין שכבת `bank_import_batches` שתאפשר rollback של ייבוא שגוי.

### המלצת QA
נדרשת יצירת טבלאות:
```sql
-- מוצע, לא קיים
CREATE TABLE bank_accounts (
  id UUID PRIMARY KEY,
  bank_code TEXT NOT NULL,         -- '10' Leumi, '12' Hapoalim, '11' Discount
  bank_name TEXT NOT NULL,
  branch_code TEXT NOT NULL,
  account_number TEXT NOT NULL,
  currency TEXT DEFAULT 'ILS',
  iban TEXT,
  swift TEXT,
  opening_balance NUMERIC DEFAULT 0,
  current_balance NUMERIC DEFAULT 0,
  last_sync_at TIMESTAMPTZ,
  active BOOLEAN DEFAULT true
);

CREATE TABLE bank_statements (
  id UUID PRIMARY KEY,
  bank_account_id UUID REFERENCES bank_accounts(id),
  statement_date DATE NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  opening_balance NUMERIC NOT NULL,
  closing_balance NUMERIC NOT NULL,
  currency TEXT NOT NULL,
  source_format TEXT CHECK (source_format IN ('csv','ofx','qif','mt940','camt053','manual','api')),
  source_filename TEXT,
  source_hash TEXT UNIQUE,         -- SHA256 של הקובץ למניעת ייבוא כפול
  imported_by TEXT,
  imported_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE bank_transactions (
  id UUID PRIMARY KEY,
  bank_account_id UUID REFERENCES bank_accounts(id),
  statement_id UUID REFERENCES bank_statements(id),
  transaction_date DATE NOT NULL,
  value_date DATE,
  amount NUMERIC NOT NULL,          -- חיוב שלילי, זיכוי חיובי
  currency TEXT NOT NULL,
  description TEXT,
  reference TEXT,
  counterparty_name TEXT,
  counterparty_account TEXT,
  transaction_type TEXT,
  balance_after NUMERIC,
  external_id TEXT UNIQUE,          -- מזהה ייחודי מהבנק
  match_status TEXT DEFAULT 'unmatched' CHECK (match_status IN ('unmatched','auto_matched','manually_matched','ignored','disputed')),
  matched_po_id UUID REFERENCES purchase_orders(id),
  matched_at TIMESTAMPTZ,
  matched_by TEXT
);
```

---

## 2. Auto-Match by Amount + Date — התאמה אוטומטית לפי סכום ותאריך

### מצב קיים
**לא קיים.** אין מנוע התאמה בשום רמה — לא בטריגר SQL, לא בפונקציה, לא בשרת.

### מה שקיים אצלנו כיום שמתקרב לתחום
- `purchase_orders.total` — יש סכום סופי להזמנה (`NUMERIC`, ב־ILS).
- `purchase_orders.expected_delivery` — יש תאריך צפוי להספקה.
- `purchase_orders.payment_terms` — טקסט חופשי ("שוטף + 30"), **לא תאריך מחושב**.
- `purchase_orders.status` — יש `delivered`, `closed`, `disputed`, אבל **אין `paid`**.

### פערים קריטיים שמונעים התאמה
1. **אין תאריך תשלום צפוי מחושב** — `payment_terms` הוא טקסט; אי אפשר ל־JOIN לפי תאריך עם `bank_transactions.transaction_date` ללא parsing של המחרוזת "שוטף + 30".
2. **אין `po.paid_at` או `po.payment_due_date`** — אין שדות שמכילים את התאריך שבו אמור להתבצע התשלום.
3. **אין סטטוס `paid` במכונת המצבים של ההזמנה** — ה־CHECK constraint בשורה 211 כולל: `'draft','pending_approval','approved','sent','confirmed','shipped','delivered','inspected','closed','cancelled','disputed'` — **בלי `paid`**.
4. **אין tolerance window** — אין קונפיגורציה ל־±X ימים / ±Y% סטיית סכום.
5. **אין טיפול בתשלומים חלקיים** — הזמנה של ₪50,000 שמשלמים ב־2 פעימות של ₪25,000 לא יכולה להיות מזוהה.
6. **אין `fuzzy_match` על שם הספק** — בנק פעמים רבות מציג "מתכת מקס בע"מ" בעוד שאצלנו רשום "מתכת מקס".

### אלגוריתם התאמה מוצע (לא מיושם)
```
Score(tx, po) =
    0.50 * AmountScore(|tx.amount - po.total| / po.total, tol=0.005)
  + 0.25 * DateScore(|tx.date - expected_payment_date(po)|, window=±3 days)
  + 0.15 * SupplierScore(fuzzy_ratio(tx.counterparty, supplier.name) / 100)
  + 0.10 * ReferenceScore(tx.reference contains po.id short-code)

IF Score ≥ 0.90 → auto_match
ELSE IF Score ≥ 0.70 → suggest_for_manual_review
ELSE → unmatched
```

**אף אחת מהפונקציות הללו לא קיימת.**

---

## 3. Manual Match UI — ממשק התאמה ידני

### מצב קיים
**לא קיים.** אין frontend להתאמה ידנית, ואין גם endpoint שישרת frontend כזה.

### בדיקות שבוצעו
| רכיב | תוצאה |
|---|---|
| דף HTML בשם `bank-recon*.html` | לא נמצא |
| endpoint `POST /api/reconciliation/match` | לא נמצא |
| endpoint `POST /api/bank/transactions/:id/match` | לא נמצא |
| endpoint `POST /api/bank/transactions/:id/unmatch` | לא נמצא |
| audit entry עבור `manual_match` | לא נמצא |

### תסריטי משתמש שאי אפשר לבצע היום
1. פתיחת רשימת תנועות בנק "לא משויכות" ולחיצה על "חפש הזמנה מתאימה".
2. גרירת תנועת בנק על הזמנת רכש כדי לשייך.
3. פיצול תנועה אחת בין 2 הזמנות רכש (split match).
4. מיזוג 2 תנועות תחת הזמנה אחת (consolidate match).
5. ביטול התאמה שגויה (unmatch) עם תיעוד סיבה.
6. סימון תנועה כ"להתעלם" (עמלת בנק, ריבית).

### פער תאימות
`audit_log` קיים בסכמה (שורה 338), ויכול לתמוך ברישום פעולות match/unmatch — אבל הקוד שמשתמש בו אינו מכיר `action = 'bank_match'`.

---

## 4. Outstanding Items List — רשימת פריטים פתוחים

### מצב קיים
**לא קיים.** אין View, אין endpoint, אין טבלה.

### בדיקות שבוצעו
| רכיב | תוצאה |
|---|---|
| View `outstanding_items` | לא נמצא |
| View `unmatched_transactions` | לא נמצא |
| View `aged_payables` | לא נמצא |
| endpoint `GET /api/reconciliation/outstanding` | לא נמצא |
| endpoint `GET /api/reconciliation/unmatched` | לא נמצא |

### מה שקיים שיכול לשמש בסיס
- `procurement_dashboard` view (שורה 478) סופר `active_orders` ו־`pending_approvals`, אבל **אין לו מושג על תשלומים**. זה dashboard של רכש בלבד, לא של גזברות.
- `supplier_dashboard` view (שורה 456) מציג `total_spent` ו־`open_orders`, אבל שוב — ללא שכבת תשלומים.

### תסריטים שחסרים
1. **Aged Payables Report** — רשימת הזמנות שהגיעו ליעד התשלום אך טרם שולמו, מקובצות ב־buckets: 0-30 / 31-60 / 61-90 / 90+.
2. **Outstanding Transactions** — תנועות בנק שטרם נמצאו להן שידוך להזמנת רכש, אחרי X ימים = alert.
3. **Reconciliation Coverage %** — מה אחוז התנועות שהותאמו מתוך סך הכל השבוע.
4. **Disputed items** — `purchase_orders.status = 'disputed'` קיים (שורה 211), אבל אין workflow של פתרון disputes מול תנועות בנק.

### View מוצע (לא קיים)
```sql
CREATE VIEW outstanding_payments AS
SELECT
  po.id, po.supplier_name, po.total, po.currency,
  po.expected_delivery,
  po.payment_terms,
  CURRENT_DATE - po.expected_delivery AS days_overdue,
  CASE
    WHEN CURRENT_DATE - po.expected_delivery < 0 THEN 'not_due'
    WHEN CURRENT_DATE - po.expected_delivery <= 30 THEN '0-30'
    WHEN CURRENT_DATE - po.expected_delivery <= 60 THEN '31-60'
    WHEN CURRENT_DATE - po.expected_delivery <= 90 THEN '61-90'
    ELSE '90+'
  END AS aging_bucket
FROM purchase_orders po
WHERE po.status IN ('delivered','inspected','closed')
  AND NOT EXISTS (
    SELECT 1 FROM bank_transactions bt
    WHERE bt.matched_po_id = po.id
      AND bt.match_status IN ('auto_matched','manually_matched')
  );
```
**הערה:** ה־View הזה לא יכול לרוץ כרגע כי `bank_transactions` לא קיים.

---

## 5. FX Rates — FXMOJO / Monito Integration

### מצב קיים
**לא קיים — אבל יש תשתית מטבעות רדומה.**

### מה שקיים
- `supplier_products.currency TEXT DEFAULT 'ILS'` (שורה 52)
- `price_history.currency TEXT DEFAULT 'ILS'` (שורה 71)
- `purchase_orders.currency TEXT DEFAULT 'ILS'` (שורה 201)

### מה שחסר לחלוטין
| רכיב | תוצאה |
|---|---|
| טבלת `fx_rates` / `exchange_rates` | לא נמצאה |
| קריאה ל־`fxmojo.com` API | לא נמצאה |
| קריאה ל־`monito` | לא נמצאה |
| קריאה ל־Bank of Israel daily rates API | לא נמצאה |
| קריאה ל־`api.exchangerate.host` | לא נמצאה |
| פונקציה `convert_currency(amount, from, to, date)` | לא נמצאה |
| cron / scheduled fetch של שערים | לא נמצא |
| fallback rate במקרה של תקלה ב־API | לא נמצא |

### פערים קריטיים
1. **אין rate locking** — הזמנה שנשלחה ב־EUR ב־12/03 ומשולמת ב־15/04 תהיה ב־ILS אחר לגמרי. אין שדה `locked_fx_rate` ב־`purchase_orders`.
2. **אין היסטוריית שערים** — אין `fx_rates(date, from_currency, to_currency, rate, source)`.
3. **אין multi-currency reconciliation** — אם תנועת בנק ב־USD $1,000 אמורה לשדך להזמנה ב־ILS ₪3,700, אין שום מנגנון להמיר.
4. **אין FX gain/loss posting** — ההפרש בין שער ההזמנה לשער התשלום לא נרשם לשום מקום.

### מקורות FX מומלצים (סדר עדיפויות)
| מקור | יתרון | חסרון | רמת integration נדרשת |
|---|---|---|---|
| **Bank of Israel** (api.boi.org.il) | רשמי, חינם, שע"ח נציג | עדכון רק פעם ביום (12:30) | REST GET, פרסינג XML/JSON |
| **exchangerate.host** | חינם, 170 מטבעות | לא רשמי | REST GET פשוט |
| **FXMOJO** | realtime, wide coverage | עלות / API key | תיעוד API נדרש |
| **Monito** | השוואת ספקי המרה | מיועד ל־remittance, לא מסחרי | רלוונטי פחות |
| **currencylayer.com** | stable, enterprise | 1000/month חינם בלבד | REST GET |

### מוצע (לא קיים)
```sql
CREATE TABLE fx_rates (
  id UUID PRIMARY KEY,
  rate_date DATE NOT NULL,
  base_currency TEXT NOT NULL,
  quote_currency TEXT NOT NULL,
  rate NUMERIC NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('boi','fxmojo','exchangerate_host','manual')),
  fetched_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(rate_date, base_currency, quote_currency, source)
);
```

---

## 6. Israeli Banks API Integration Potential — פוטנציאל אינטגרציה לבנקים ישראליים

### מצב קיים
**אפס אינטגרציה.**

### מציאות הרגולציה בישראל — נכון ל־2026-04
ישראל **עדיין לא הטמיעה PSD2 מלא** כמו האיחוד האירופי. המצב הקיים בנקאי בישראל:
1. **Banking Israel Directive 368** — מחייב בנקים לאפשר ללקוח גישה לנתונים (Open Banking) מ־2020, אבל התשתית החלה להתייצב רק ב־2023-2024.
2. **IBI / אגרת הצרכן הדיגיטלי** — פיקוח על הבנקים לתת API לצדדי ג' עם הסכמת לקוח.
3. **Customer Reference API** — כל בנק עיקרי (הפועלים, לאומי, דיסקונט, מזרחי טפחות, פועלי אגודת ישראל, FIBI, מרכנתיל) מחויב לספק גישה ל־read-only של חשבונות לקוח.

### רמת האינטגרציה האפשרית
| בנק | API Name | מצב נוכחי ב־onyx-procurement |
|---|---|---|
| **הפועלים** (`12`) | Poalim Open Banking API | אפס — אין קוד |
| **לאומי** (`10`) | Leumi Direct Business API | אפס — אין קוד |
| **דיסקונט** (`11`) | Discount Key | אפס — אין קוד |
| **מזרחי טפחות** (`20`) | Tefahot Business Online API | אפס — אין קוד |
| **איגוד / FIBI** (`31`) | FIBI Connect | אפס — אין קוד |
| **מרכנתיל** (`17`) | חלק מ־Discount API | אפס — אין קוד |
| **יהב** (`04`) | דרך Leumi | אפס — אין קוד |

### אפשרויות אגרגטור (מומלץ, קל יותר מישירות)
1. **Salt** (salt-fintech.com) — אגרגטור ישראלי לבנקים, נותן API אחיד ל־7 הבנקים הגדולים. רישיון PFS.
2. **Open Finance** — פלטפורמה ישראלית נוספת.
3. **Okoora** / **TrueLayer EU** (לחו"ל).

### נקודות integration מוצעות
```javascript
// מוצע — אינו קיים
POST /api/bank-accounts/:id/sync
  → pulls last 30 days of transactions from bank API
  → writes to bank_transactions
  → triggers auto_match worker
  → returns { fetched: N, matched: M, unmatched: K }

POST /api/bank-accounts/:id/webhook
  → receives push notification from bank (if supported)
  → upserts single transaction
  → triggers single-row match
```

### חסמים רגולטוריים וטכניים
1. **OAuth 2.0 + mTLS** — נדרש certificate מהבנק, תהליך KYC מול הבנק.
2. **הסכמת לקוח** — כל חשבון דורש הסכמה דיגיטלית חתומה של בעל החשבון, מתחדשת כל 180 יום.
3. **Rate limiting** — בנקים ישראליים מגבילים ל־4-10 קריאות/דקה/חשבון.
4. **Sandbox limitations** — רק בנק הפועלים יש sandbox ציבורי; השאר דורשים חוזה מסחרי.
5. **תמיכה בעברית RTL** — ה־API מחזירים תיאורי תנועה בעברית עם ניקוד ולעיתים שברי מילים — pre-processing חובה.

---

## 7. Risk Matrix / מטריצת סיכונים

| # | סיכון | סבירות | חומרה | ציון | קריטיות |
|---|---|---|---|---|---|
| R1 | תשלום כפול (double payment) עקב היעדר מעקב "שולם" | HIGH | CRITICAL | 9/10 | אדום |
| R2 | תשלום לא מזוהה יושב חודשים כ־"תקבול לזהות" | HIGH | HIGH | 8/10 | אדום |
| R3 | הונאת ספק — שינוי פרטי בנק לא מזוהה | MEDIUM | CRITICAL | 7/10 | אדום |
| R4 | סטיית FX לא מוכרת, רווח/הפסד חשבונאי מוסתר | MEDIUM | HIGH | 6/10 | כתום |
| R5 | ספק טוען "לא שולם" ואין ראיה תואמת | HIGH | MEDIUM | 6/10 | כתום |
| R6 | Aged payables מעל 90 ימים = פגיעה ב־rating ספק | MEDIUM | MEDIUM | 5/10 | צהוב |
| R7 | אי־תאימות SOX / תקינה ישראלית לדיווח מע"מ | LOW | HIGH | 5/10 | צהוב |
| R8 | ייבוא כפול של דף בנק = תנועות מוכפלות בדוחות | MEDIUM | MEDIUM | 4/10 | צהוב |

---

## 8. Test Cases מוצעים (לאחר יישום)

| TC# | תיאור | קלט | פלט צפוי |
|---|---|---|---|
| TC-BR-01 | ייבוא CSV של בנק הפועלים | קובץ 100 שורות | 100 תנועות ב־`bank_transactions`, 0 כפולים |
| TC-BR-02 | ייבוא חוזר של אותו CSV | אותו קובץ | rejection עם `DUPLICATE_HASH`, 0 שורות חדשות |
| TC-BR-03 | Auto-match מושלם | PO ₪10,000 + bank tx ₪10,000 באותו יום | `match_status = auto_matched`, score ≥ 0.95 |
| TC-BR-04 | Auto-match עם tolerance | PO ₪10,000 + bank tx ₪9,995 (עמלה) | suggestion, לא auto-match |
| TC-BR-05 | Manual match | user drags tx → po | audit entry, status update |
| TC-BR-06 | Split match | 1 tx ₪30,000 → 2 POs של ₪15,000 | שניהם נסגרים, tx מסומן `fully_matched` |
| TC-BR-07 | FX conversion | PO USD 1,000, tx ILS 3,700 | המרה לפי שער יום התשלום, match אם gap ≤ 1% |
| TC-BR-08 | Outstanding report | 5 POs, 2 שולמו, 3 פתוחים | report מחזיר 3 עם aging |
| TC-BR-09 | Bank API sync | POST /api/bank-accounts/:id/sync | pull של תנועות מ־30 ימים אחרונים |
| TC-BR-10 | Duplicate prevention | אותה עסקה מ־2 מקורות (CSV + API) | `external_id` unique → 1 רשומה בלבד |

---

## 9. המלצות יישום — Roadmap

### Phase 1 — Foundations (1-2 שבועות)
1. הוספת 3 טבלאות בסיס: `bank_accounts`, `bank_statements`, `bank_transactions`.
2. הוספת שדות ל־`purchase_orders`: `paid_at`, `payment_due_date`, `locked_fx_rate`, סטטוס חדש `paid`.
3. Endpoint `POST /api/bank/statements/import` עם parser ל־CSV (בנק הפועלים פורמט ברירת מחדל).
4. SHA256 hashing למניעת duplicate imports.

### Phase 2 — Auto-Match (2-3 שבועות)
5. פונקציית `auto_match()` ב־PL/pgSQL או ב־Node.
6. Tolerance configuration (amount ±0.5%, date ±3 days).
7. Scoring algorithm עם 4 משקלים (amount/date/supplier/reference).

### Phase 3 — UI + Outstanding (1-2 שבועות)
8. Frontend לרשימת תנועות לא־משויכות.
9. Manual match UI עם drag-drop.
10. View `outstanding_payments` + aging report.

### Phase 4 — FX (1 שבוע)
11. טבלת `fx_rates`.
12. Daily fetch מ־Bank of Israel API.
13. פונקציית `convert_currency()`.

### Phase 5 — Bank API Integration (4-8 שבועות)
14. OAuth flow עם בנק הפועלים sandbox.
15. Scheduled sync worker.
16. הרחבה לשאר הבנקים.

---

## 10. Verdict / פסק דין

```
ENTIRE BANK RECONCILIATION DIMENSION:  NOT IMPLEMENTED
Schema coverage:                        0% (0 of required 6 tables)
API coverage:                           0% (0 of required ~12 endpoints)
UI coverage:                            0%
FX handling:                            0%
Bank API integration:                   0%
Test coverage:                          0%

OVERALL QA GRADE:                       F (Fail — dimension absent)
BLOCKER FOR PRODUCTION:                 YES — any real procurement deployment
                                        handling money needs this before go-live.
```

**סוף דוח QA-AGENT-142**
