# QA #140 — דוח מע"מ (Form 836 / PCN836)
## onyx-procurement — Static Review

**Agent:** QA-140
**Date:** 2026-04-11
**Mode:** Static (ללא הרצה)
**Dimension:** דוח מע"מ — Form 836 (קובץ PCN לשע"מ)
**Scope:** `onyx-procurement/supabase/migrations/001-supabase-schema.sql` + `onyx-procurement/server.js`
**Regulator:** רשות המסים — מע"מ (Israel Tax Authority / שע"מ)
**Legal Basis:** חוק מס ערך מוסף התשל"ו-1975 + תקנות מע"מ (ניהול פנקסי חשבונות) + הוראות ניהול ספרים

---

## 0. Executive Summary

| נושא | סטטוס |
|------|-------|
| תמיכה בדיווח דו-חודשי | ❌ לא קיים |
| מע"מ עסקאות (Output VAT) | ❌ לא קיים כשדה — רק per-PO |
| מע"מ תשומות (Input VAT) | ⚠️ שדות קיימים (`vat_amount` ב-POs/quotes) אך ללא אגרגציה |
| פורמט PCN / Form 836 | ❌ לא מיושם |
| הגשה אוטומטית לשע"מ | ❌ לא מיושם |
| התאמה מול הנה"ח | ❌ לא מיושם |
| **אחוז מוכנות כולל** | **~8%** |

**שורה תחתונה:** מודול onyx-procurement מחזיק מע"מ ברמת עסקה בודדת (PO/quote) עם שיעור קבוע של 18% ב-`server.js` שורה 377, אך אין בו שום תשתית לדיווח תקופתי, הפקת קובץ PCN836, הגשה לשע"מ או התאמה חשבונאית. המודול אינו תואם למחויבות דיווח מע"מ של עוסק מורשה בישראל.

---

## 1. ממצאים — סכמה (001-supabase-schema.sql)

### 1.1 שדות מע"מ קיימים בסכמה

**`supplier_quotes` (שורות 149-167):**
```sql
total_price     NUMERIC NOT NULL,
vat_included    BOOLEAN DEFAULT false,
vat_amount      NUMERIC DEFAULT 0,
total_with_vat  NUMERIC NOT NULL,
```

**`purchase_orders` (שורות 192-211):**
```sql
subtotal        NUMERIC NOT NULL,
delivery_fee    NUMERIC DEFAULT 0,
vat_amount      NUMERIC DEFAULT 0,
total           NUMERIC NOT NULL,
currency        TEXT DEFAULT 'ILS',
```

### 1.2 מה חסר בסכמה

| שדה/טבלה חסרים | חומרה | נדרש עבור |
|----------------|--------|-----------|
| `vat_rate` (שיעור היסטורי) | 🔴 Critical | שינויי שיעור מע"מ (17%→18% ב-2025) |
| `vat_rate_effective_date` | 🔴 Critical | חישוב לפי תקופה היסטורית |
| `vat_periods` (טבלה) | 🔴 Critical | תקופות דיווח דו-חודשיות |
| `vat_reports` (טבלה) | 🔴 Critical | היסטוריית דוחות 836 שהוגשו |
| `vat_report_lines` | 🔴 Critical | שורות דיווח (חשבוניות פרטניות) |
| `tax_invoices` (טבלה) | 🔴 Critical | חשבונית מס נכנסת (חסרה לחלוטין) |
| `vat_authority_id` בספק | 🔴 Critical | ח.פ./ע.מ לזיהוי בדוח 836 |
| `israeli_invoice_allocation_number` | 🟠 High | מספר הקצאה (חובה 2024+) |
| `reverse_charge_flag` | 🟠 High | חיוב עצמי (שירותים מחו"ל) |
| `zero_rated_flag` | 🟡 Medium | עסקה בשיעור אפס |
| `exempt_flag` | 🟡 Medium | עסקה פטורה |
| `submission_log` / `shaam_response` | 🟠 High | audit trail של הגשות |
| `reconciliation_status` | 🟠 High | סטטוס התאמה להנה"ח |

### 1.3 בעיות בשדות קיימים

1. **`vat_amount NUMERIC` ללא דיוק** — יש להיות `NUMERIC(14,2)` או מטבע כ-`BIGINT` באגורות (ראה QA-38 Money Precision).
2. **אין `CHECK` שמוודא** ש-`total_with_vat = total_price + vat_amount` (data integrity).
3. **אין אינדקס על `created_at`** של POs עבור שאילתות תקופתיות — יגרום סריקת טבלה מלאה.
4. **אין הפרדה בין תאריך חשבונית לתאריך הזמנה** — הדיווח חייב להתבסס על תאריך החשבונית.
5. **`currency TEXT DEFAULT 'ILS'`** — אין המרה לשקלים לצורכי דיווח עבור עסקאות במט"ח.

---

## 2. ממצאים — server.js

### 2.1 טיפול קיים במע"מ

**server.js:377 — חישוב מע"מ קבוע:**
```javascript
const vatAmount = quoteData.vat_included ? 0 : Math.round(totalPrice * 0.18);
const totalWithVat = totalPrice + vatAmount;
```

**server.js:482 — צירוף ל-quote:**
```javascript
total_with_vat: quote.total_with_vat,
```

**server.js:517 — פלט WhatsApp:**
```javascript
`💵 עלות: ₪${winner.total_price.toLocaleString()} + מע"מ = ₪${winner.total_with_vat.toLocaleString()}`,
```

**server.js:530-531 — שמירה ב-PO:**
```javascript
vat_amount: winnerQuote.vat_amount,
total: winner.total_with_vat,
```

**server.js:649 — PDF של PO:**
```javascript
`מע"מ: ₪${po.vat_amount.toLocaleString()}`,
```

### 2.2 מה חסר בשרת

| API / פונקציה חסרים | חומרה |
|---------------------|--------|
| `POST /api/vat-reports/generate?period=YYYY-MM` | 🔴 Critical |
| `GET /api/vat-reports/:period` | 🔴 Critical |
| `GET /api/vat-reports/:period/pcn-file` (Form 836) | 🔴 Critical |
| `POST /api/vat-reports/:period/submit-to-shaam` | 🔴 Critical |
| `POST /api/vat-reports/:period/reconcile` | 🔴 Critical |
| פונקציית agg: `calculateBiMonthlyVAT(fromDate, toDate)` | 🔴 Critical |
| פונקציית קידוד: `encodePCN836(reportData)` | 🔴 Critical |
| פונקציית הגשה: `submitToShaam(pcnBuffer, credentials)` | 🔴 Critical |
| Cron: תזכורות דו-חודשיות (15 בחודש) | 🟠 High |
| Worker: שידור שגיאות/אישורים מ-שע"מ | 🟠 High |

### 2.3 Hard-coded של שיעור מע"מ

**🔴 Critical:** שיעור 0.18 משורת קוד יחידה (377). אין קונפיגורציה ב-environment, אין טבלת היסטוריה, אין תמיכה בעסקאות לפני 1.1.2025 (שבהן השיעור היה 17%).

---

## 3. Gap Analysis — 6 דרישות

### 3.1 תמיכה בדיווח דו-חודשי (Bi-monthly) ❌

**דרישה חוקית:** עוסק מורשה עם מחזור עסקאות קטן מ-1,514,770 ₪ (2026) חייב בדיווח **דו-חודשי**. מחזור גבוה יותר — דיווח **חודשי**. Reports ב-PCN דרך אתר שע"מ עד ה-15 של החודש שלאחר תום התקופה.

**מצב נוכחי:**
- ❌ אין טבלת `vat_periods`
- ❌ אין לוגיקה לקביעת אוטומטית של תקופה דו-חודשית/חודשית לפי מחזור
- ❌ אין חישוב של "דו חודשי = ינו-פבר, מרץ-אפר..."
- ❌ אין זיהוי תקופות פתוחות/סגורות/הוגשו
- ❌ אין lock מניעת שינויים לאחר הגשה

**נדרש:**
```sql
CREATE TABLE vat_periods (
  id UUID PRIMARY KEY,
  period_type TEXT CHECK (period_type IN ('monthly','bimonthly')),
  period_code TEXT NOT NULL, -- '2026-01' או '2026-0102'
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  status TEXT CHECK (status IN ('open','closed','submitted','accepted','rejected','amended')),
  locked_at TIMESTAMPTZ,
  UNIQUE(period_code)
);
```

### 3.2 מע"מ עסקאות — Output VAT (מכירות) ❌

**דרישה:** דיווח מצטבר של סך מחזור חייב + סך מע"מ שחויב מכל חשבוניות המס שהוצאו בתקופה.

**מצב נוכחי:**
- ⚠️ onyx-procurement הוא מודול **רכש** — עוסק ב-Input VAT בעיקרו
- ❌ אין טבלת `sales_invoices` / `tax_invoices_issued`
- ❌ אין אינטגרציה עם מודול מכירות (שאמור להיות ב-onyx-sales / onyx-finance)
- ❌ אין API שמושך עסקאות מכירה מ-ledger חיצוני

**נדרש:** חיבור לטבלת sales מעודכנת עם `invoice_number`, `invoice_date`, `customer_tax_id`, `taxable_amount`, `vat_amount`, `allocation_number`.

### 3.3 מע"מ תשומות — Input VAT (רכש) ⚠️

**דרישה:** סך מע"מ תשומות הניתן לניכוי, מפורק ל:
- תשומות ציוד (עד 2/3 במקרים של עירוב פרטי)
- תשומות אחרות
- תשומות אסורות לניכוי (רכב פרטי, כיבודים, הוצאות פרטיות)

**מצב נוכחי:**
- ✅ `purchase_orders.vat_amount` זמין
- ❌ אין סיווג לתשומות ציוד/אחרות/אסורות
- ❌ אין קישור PO ל-`tax_invoice` רשמי עם מספר חשבונית ספק
- ❌ אין וולידציה של מספר הקצאה (Israeli Invoice, חובה 2024+)
- ❌ אין agg בתקופה: `SUM(vat_amount) WHERE invoice_date BETWEEN x AND y`
- ❌ אין טיפול ב-reverse charge (חיוב עצמי) עבור שירותים מחו"ל
- ❌ אין אינדקס על `expected_delivery` או תאריך חשבונית

**נדרש:**
```sql
CREATE TABLE tax_invoices (
  id UUID PRIMARY KEY,
  po_id UUID REFERENCES purchase_orders(id),
  supplier_tax_id TEXT NOT NULL,
  invoice_number TEXT NOT NULL,
  allocation_number TEXT, -- מספר הקצאה (Israel 2024+)
  invoice_date DATE NOT NULL,
  taxable_amount NUMERIC(14,2) NOT NULL,
  vat_rate NUMERIC(5,2) NOT NULL,
  vat_amount NUMERIC(14,2) NOT NULL,
  vat_category TEXT CHECK (vat_category IN ('equipment','general','forbidden','zero_rate','exempt','reverse_charge')),
  deductible_percent NUMERIC(5,2) DEFAULT 100.00,
  deductible_amount NUMERIC(14,2),
  period_id UUID REFERENCES vat_periods(id),
  UNIQUE(supplier_tax_id, invoice_number)
);
```

### 3.4 פורמט קובץ PCN / Form 836 ❌

**דרישה:** קובץ **PCN836** — text file ASCII ברוחב קבוע, בעל מבנה רשומות דו-אופי:
- **Header (רשומה A):** ע.מ/ח.פ, שם עוסק, תקופת דיווח, סוג דוח, תאריך הפקה
- **רשומות T — עסקאות מפורטות (per invoice):** ספק/לקוח, ת.ז, ח.פ, מספר חשבונית, מספר הקצאה, תאריך, סכום, סוג (S מכירה / P רכש), מע"מ
- **Footer (רשומה B/Z):** סיכום — סכ"ה עסקאות, סכ"ה תשומות, יתרה לתשלום/החזר, checksum

**פורמט:**
- Fixed-width ASCII
- Encoding CP862 או CP1255 (windows-hebrew)
- שדות ממורכזים/רפודים באפסים מימין למספרים, רווחים מימין לטקסט
- CRLF line endings
- שם קובץ: `PCN<עוסק><תקופה>.pcn`

**מצב נוכחי:**
- ❌ אין שום קוד PCN
- ❌ אין מבנה רשומות
- ❌ אין encoder ל-Hebrew encoding (cp862/cp1255)
- ❌ אין validation של מבנה רשומה לפי מפרט שע"מ
- ❌ אין חתימה דיגיטלית (smart card)

**נדרש:** מודול `services/pcn836.js` שכולל:
```javascript
export function buildPCN836({ vatId, periodCode, outputInvoices, inputInvoices }) {
  const header = buildHeaderRecord(vatId, periodCode);
  const txnRecords = [...outputInvoices, ...inputInvoices].map(buildTxnRecord);
  const footer = buildFooterRecord(totals);
  const lines = [header, ...txnRecords, footer];
  return Buffer.from(lines.join('\r\n'), 'cp862');
}
```

### 3.5 הגשה אוטומטית לשע"מ ❌

**דרישה:** הגשה דרך אתר שע"מ (idf.gov.il / taxes.gov.il) או via API רשמי:
- Authentication: כרטיס חכם (smart card) + PIN או OTP
- העלאת קובץ PCN836
- קבלת אישור מספר אסמכתא
- תשלום חוב (או קבלת החזר) דרך שע"מ online

**מצב נוכחי:**
- ❌ אין client ל-API של שע"מ
- ❌ אין תמיכה ב-smart card / חתימה דיגיטלית
- ❌ אין retry mechanism עבור כשלי רשת
- ❌ אין שמירת receipt/acknowledgment
- ❌ אין תזכורות עד ה-15 של החודש העוקב

**נדרש:**
```javascript
// services/shaam-submission.js
export async function submitToShaam(pcnBuffer, credentials) {
  // 1. Sign with smart card / digital cert
  // 2. POST to shaam endpoint (multipart/form-data)
  // 3. Parse response XML
  // 4. Store asmachta + timestamp
  // 5. Return { success, asmachta, errors }
}
```

### 3.6 התאמה מול הנה"ח (Reconciliation) ❌

**דרישה:** לפני הגשה — התאמה בין:
- סכומי PO ב-onyx-procurement
- רישום חשבונאי ב-GL (general ledger)
- קופה/בנק (payments)
- סכומים בקובץ PCN

**מצב נוכחי:**
- ❌ אין מודול הנה"ח
- ❌ אין טבלת journal entries
- ❌ אין trial balance מול דוח 836
- ❌ אין דוח diff
- ❌ אין approval workflow לפני הגשה

**נדרש:**
- פונקציה `reconcileVATPeriod(periodId)`: משווה `SUM(purchase_orders.vat_amount) WHERE created_at BETWEEN period.start AND period.end` מול GL accounts `1550 (מע"מ תשומות)` ו-`2550 (מע"מ עסקאות)`.
- Report של הפרשים עם משלושת המקורות (PO / GL / PCN).
- חובה: approval workflow של רוה"ח לפני הגשה.

---

## 4. Risk Matrix

| Risk | Probability | Impact | Severity |
|------|-------------|--------|----------|
| הגשה ידנית — טעויות אנוש | High | High | 🔴 Critical |
| איחור בהגשה (חוסר אוטומציה) | High | High | 🔴 Critical — ריבית + קנס |
| חישוב שגוי של תשומות אסורות | Medium | High | 🔴 Critical — חשיפה לביקורת שע"מ |
| אין audit trail | High | Medium | 🟠 High — בעיה בביקורת |
| חוסר תיעוד של מספרי הקצאה | Medium | High | 🔴 Critical (2024+) |
| אין lock על תקופה שהוגשה | Medium | High | 🟠 High — שינוי בדיעבד |
| currency hard-coded ILS | Medium | Medium | 🟠 High |
| אין reverse-charge (שירותי חו"ל) | Low | High | 🟠 High |

---

## 5. Test Cases (Static — להרצה עתידית)

### 5.1 Unit Tests — חישוב מע"מ
- [ ] TC-001: חישוב 18% — `calcVAT(1000) === 180`
- [ ] TC-002: חישוב 17% היסטורי — `calcVAT(1000, '2024-12-15') === 170`
- [ ] TC-003: עיגול אגורות — `calcVAT(33.33) === 6`
- [ ] TC-004: vat_included=true → vat_amount = 0 (נכון?)
- [ ] TC-005: total_with_vat = subtotal + vat_amount

### 5.2 Period Tests
- [ ] TC-006: זיהוי תקופה דו-חודשית לחשבונית מ-15/1
- [ ] TC-007: חשבונית מ-31/12 — שייכת לתקופה דצמ-יאנו?
- [ ] TC-008: חשבונית מחושבת רטרו (backdating) — נדחית?
- [ ] TC-009: מעבר דיווח חודשי→דו-חודשי לפי מחזור

### 5.3 PCN836 Tests
- [ ] TC-010: header ברוחב 120 תווים, padded correctly
- [ ] TC-011: encoding cp862 — אותיות עבריות תקינות
- [ ] TC-012: footer sum = סך רשומות T
- [ ] TC-013: מספר עוסק 9 ספרות עם 0 מוביל
- [ ] TC-014: תקופה בפורמט YYYYMM או YYYYMMDD
- [ ] TC-015: אי-תקינות — ללא מספר הקצאה → warning (2024+)

### 5.4 Input VAT Aggregation
- [ ] TC-016: sum של vat_amount ב-POs לפי תקופה
- [ ] TC-017: הפרדה בין deductible ל-non-deductible
- [ ] TC-018: טיפול ב-reverse charge (חיוב עצמי)
- [ ] TC-019: currency conversion מ-USD ל-ILS

### 5.5 Submission Tests
- [ ] TC-020: mock של שע"מ — success → store asmachta
- [ ] TC-021: mock של שע"מ — network fail → retry
- [ ] TC-022: mock של שע"מ — validation error → report errors
- [ ] TC-023: submission twice של אותה תקופה → reject
- [ ] TC-024: amendment (תיקון) — period status → 'amended'

### 5.6 Reconciliation Tests
- [ ] TC-025: PO sum = GL sum → match
- [ ] TC-026: diff > 0 → block submission
- [ ] TC-027: missing invoices → flag
- [ ] TC-028: approval required by CFO → block without approval

---

## 6. Compliance Checklist

### 6.1 חוק מע"מ התשל"ו-1975
- ❌ סעיף 67(א) — חובת דיווח תקופתי במועד
- ❌ סעיף 69 — חשבונית מס עם מספר הקצאה (2024+)
- ❌ סעיף 74 — ניכוי מע"מ תשומות בתנאי
- ❌ סעיף 77 — שמירת מסמכים 7 שנים
- ❌ תקנה 23 — הגשה דיגיטלית (PCN)

### 6.2 הוראות ניהול ספרים (1973)
- ⚠️ פרק א' סעיף 1 — פנקסי חשבונות
- ❌ פרק ב' סעיף 18 — חשבוניות מס רכש
- ❌ פרק ג' — דוח מע"מ

### 6.3 רפורמת "חשבונית ישראל" 2024+
- ❌ מספר הקצאה (Allocation Number) חובה לחשבוניות מעל 25,000 ₪
- ❌ חתימה דיגיטלית
- ❌ אימות online מול שע"מ

---

## 7. Recommendations (Priority Order)

### P0 (חובה מיידית — Legal Compliance)
1. **יצירת מודול `onyx-vat-reports`** נפרד (SoC) או תת-מודול
2. **טבלת `tax_invoices`** עם כל השדות החסרים
3. **טבלת `vat_periods`** עם lock mechanism
4. **שיעור מע"מ מקונפיגורציה** — `vat_rates` table היסטורי
5. **מודול מספרי הקצאה** (Israeli Invoice 2024+)

### P1 (גבוה — 30 יום)
6. **מחולל PCN836** בסיסי (ללא submission) + validation
7. **API endpoint `GET /api/vat-reports/:period/pcn-file`**
8. **רפורט reconciliation** ידני
9. **Cron תזכורות דו-חודשיות**
10. **CHECK constraints** על שדות מע"מ
11. **Indexes תקופתיים** על `created_at`/`invoice_date`

### P2 (בינוני — 60-90 יום)
12. **אינטגרציית שע"מ** (API + smart card)
13. **Auto-submission** עם retry
14. **Amendment workflow** לתיקון דוחות
15. **CFO approval workflow**
16. **Audit trail מלא**

### P3 (עתידי)
17. **Reverse charge** לשירותי חו"ל
18. **Multi-currency** עם rate at invoice date
19. **Dashboard מצב תקופות** (פתוחות/הוגשו/אושרו)
20. **AI anomaly detection** על דוחות חריגים

---

## 8. Code Stubs (להטמעה עתידית)

### 8.1 סכמה — הוספה ל-migration חדש
```sql
-- migrations/010-vat-reports.sql
CREATE TABLE vat_rates (
  id SERIAL PRIMARY KEY,
  rate NUMERIC(5,2) NOT NULL,
  effective_from DATE NOT NULL,
  effective_to DATE,
  UNIQUE(effective_from)
);
INSERT INTO vat_rates(rate, effective_from) VALUES
  (17.00, '2020-01-01'),
  (18.00, '2025-01-01');

CREATE TABLE vat_periods (...); -- as above
CREATE TABLE tax_invoices (...); -- as above

CREATE TABLE vat_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period_id UUID REFERENCES vat_periods(id) UNIQUE,
  total_output_vat NUMERIC(14,2) NOT NULL,
  total_input_vat NUMERIC(14,2) NOT NULL,
  balance_due NUMERIC(14,2) NOT NULL,
  pcn_file_path TEXT,
  pcn_file_hash TEXT,
  submitted_at TIMESTAMPTZ,
  submitted_by UUID,
  shaam_asmachta TEXT,
  shaam_response JSONB,
  reconciled_at TIMESTAMPTZ,
  reconciled_by UUID,
  status TEXT CHECK (status IN ('draft','reconciled','submitted','accepted','rejected','amended'))
);
```

### 8.2 Endpoint — server.js
```javascript
// VAT Report Generation
app.post('/api/vat-reports/generate', async (req, res) => {
  const { periodCode } = req.body;
  const period = await getPeriod(periodCode);
  if (period.status !== 'open') return res.status(400).json({ error: 'period locked' });
  const outputInvoices = await getSalesInvoices(period.start_date, period.end_date);
  const inputInvoices = await getTaxInvoices(period.start_date, period.end_date);
  const totals = calculateTotals(outputInvoices, inputInvoices);
  const report = await upsertVatReport(period.id, totals);
  res.json({ report, totals });
});

app.get('/api/vat-reports/:periodCode/pcn-file', async (req, res) => {
  const report = await getVatReport(req.params.periodCode);
  const pcn = buildPCN836(report);
  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader('Content-Disposition', `attachment; filename="PCN836_${report.period_code}.pcn"`);
  res.send(pcn);
});

app.post('/api/vat-reports/:periodCode/submit', async (req, res) => {
  const report = await getVatReport(req.params.periodCode);
  if (!report.reconciled_at) return res.status(400).json({ error: 'not reconciled' });
  const pcn = buildPCN836(report);
  const result = await submitToShaam(pcn, req.body.credentials);
  await markSubmitted(report.id, result);
  res.json(result);
});
```

---

## 9. מסקנות סופיות

**מודול onyx-procurement אינו מוכן לדיווח מע"מ תקופתי** ואינו עומד בדרישות החוק (חוק מע"מ + רפורמת חשבונית ישראל 2024+).

קיימת תשתית בסיסית להחזקת סכומי מע"מ ברמת PO בודד (vat_amount, total_with_vat), אך:
- שיעור המע"מ hard-coded (18%) — לא נתמך שינוי רטרו
- אין דיווח תקופתי (דו-חודשי/חודשי)
- אין הפקת PCN836
- אין הגשה אוטומטית לשע"מ
- אין התאמה מול הנה"ח
- אין תמיכה במספרי הקצאה (חובה 2024+)

**המלצה:** לפני השקה בייצור עסקי — **חובה** להטמיע את המודול החסר בדחיפות (P0 items 1-5). בהעדר זה — המערכת מחייבת רוה"ח חיצוני להפיק דוח ידנית חודש-חודשיים, תוך סיכון מהותי לטעויות, קנסות ורגולציה.

**אחוז התאימות נוכחי: 8%**
**אחוז יעד ל-MVP: 75%**
**אחוז יעד ל-production: 100%**

---

**End of QA-140 Report**
*נוצר על-ידי QA-140 Agent — Static Review — 2026-04-11*
*Legal basis: חוק מע"מ 1975, תקנות מע"מ, הוראות ניהול ספרים, רפורמת חשבונית ישראל 2024*
