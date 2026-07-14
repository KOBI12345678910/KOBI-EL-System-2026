# מסמך ביצוע מלא — מערכת פיננסית מוסדית לחברת יזמות נדל"ן

> **מסמך זה הוא מפרט ביצוע מקיף.** כל מודול, טבלה, שדה, נוסחה, מסך, אוטומציה, הרשאה ודוח מתועד לעומק.

---

## חלק 1: ארכיטקטורת המערכת — העיקרון המרכזי

### 1.1 עקרון האירוע הפיננסי (Financial Event-Driven Architecture)

המערכת פועלת לפי עיקרון אחד מנחה:

```
כל פעולה כספית → יוצרת אירוע פיננסי → עובר דרך מנוע חישוב מרכזי → מעדכן אוטומטית:
  ├── תקציב (Budget)
  ├── תזרים מזומנים (Cash Flow)
  ├── רווחיות (Profitability)
  ├── דוח אפס (Zero Report)
  ├── חשיפות (Exposures)
  ├── סיכונים (Risks)
  ├── דוחות (Reports)
  └── התראות (Alerts)
```

### 1.2 ממיקרוסרוויס למנוע מרכזי

המערכת בנויה מ-**מנוע חישוב מרכזי** (Financial Calculation Engine) שמקבל אירועים מכל המודולים ומבצע עדכון מדורג:

```
┌─────────────────────────────────────────────────────────────┐
│                    מודולי קלט (Input Modules)                │
│  תקציב │ חשבוניות │ תשלומים │ מכירות │ הלוואות │ מדדים │ גידור │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
              ┌────────────────────────┐
              │  Financial Event Bus   │
              │  (FinancialEventLedger)│
              └───────────┬────────────┘
                          │
                          ▼
           ┌──────────────────────────────┐
           │  מנוע חישוב מרכזי (Engine)    │
           │                              │
           │  1. BudgetEngine             │
           │  2. CashFlowEngine           │
           │  3. ProfitabilityEngine      │
           │  4. ZeroReportEngine         │
           │  5. ExposureEngine           │
           │  6. RiskEngine               │
           │  7. CovenantEngine           │
           │  8. ReportEngine             │
           │  9. AlertEngine              │
           └───────────┬──────────────────┘
                       │
                       ▼
           ┌──────────────────────────────┐
           │     מודולי פלט (Output)      │
           │                              │
           │  דוח אפס │ תזרים │ רווחיות    │
           │  סיכונים │ התראות │ דוחות     │
           │  Covenants │ חשיפות │ גידור   │
           └──────────────────────────────┘
```

### 1.3 סוגי אירועים פיננסיים

כל אירוע ב-`FinancialEventLedger` מקבל `event_type` אחד מתוך:

| סוג אירוע | גורם מקור | מנועים מופעלים |
|-----------|-----------|----------------|
| `budget_revision` | שינוי תקציב | Budget, ZeroReport, Profitability |
| `budget_transfer` | העברה בין סעיפים | Budget, ZeroReport |
| `commitment_created` | חתימת חוזה | Budget, CashFlow, Exposure |
| `invoice_received` | קליטת חשבונית | Budget, CashFlow, Profitability |
| `payment_executed` | ביצוע תשלום | CashFlow, Budget, Ledger |
| `sale_signed` | חתימת חוזה מכר | Sales, CashFlow, Profitability, ZeroReport |
| `buyer_payment` | תקבול מרוכש | CashFlow, Sales, Profitability |
| `loan_drawdown` | משיכת הלוואה | CashFlow, Treasury, Exposure |
| `loan_repayment` | פירעון הלוואה | CashFlow, Treasury |
| `interest_accrual` | צבירת ריבית | Treasury, Profitability |
| `index_update` | עדכון מדד | Budget, Sales, Loans, Exposure |
| `price_change` | שינוי מחיר | Budget, Profitability, ZeroReport, Risk |
| `hedge_executed` | ביצוע גידור | Exposure, Risk, CashFlow |
| `covenant_test` | בדיקת covenant | Covenant, Alert, Risk |
| `period_lock` | נעילת תקופה | All (freeze) |

---

## חלק 2: מודל נתונים — ישויות וקשרים

### 2.1 מפת ישויות מלאה

המערכת מכילה **מעל 100 ישויות** מאורגנות ב-7 תחומים (Domains):

#### תחום 1: הקשר ארגוני (Organizational Context)
```
Company (חברה)
  └── Portfolio (פורטפוליו)
       └── Project (פרויקט)
            ├── Units (יחידות)
            ├── BudgetItem (סעיפי תקציב)
            ├── Contract (חוזים)
            ├── Invoice (חשבוניות)
            ├── Payment (תשלומים)
            ├── Sale (מכירות)
            └── ... (כל הישויות הפיננסיות)
```

#### תחום 2: תקציב ועלויות (Budget & Cost)
- `BudgetItem` — סעיף תקציב (היררכי)
- `BudgetVersion` — גרסת תקציב
- `ChangeOrder` — שינוי כמות/מחיר
- `PriceChangeEvents` — אירוע שינוי מחיר
- `ContractLineItem` — פריט חוזה
- `InvoiceLineItem` — פריט חשבונית

#### תחום 3: מכירות ורוכשים (Sales & Buyers)
- `Units` — יחידות
- `SalesContracts` — חוזי מכר
- `Sale` — מכירה
- `PaymentScheduleItem` — פריט לוח תשלומים
- `BuyerSelection` — בחירות רוכש
- `BuyerDocument` — מסמכי רוכש
- `UnitProfitability` — רווחיות יחידה

#### תחום 4: מימון ובנק (Financing & Banking)
- `BankFacilities` — מסגרת אשראי
- `LoanTransactions` — תנועות הלוואה
- `Loan` — הלוואה
- `BankCovenant` — covenant בנקאי
- `CovenantTest` — בדיקת covenant
- `CovenantResult` — תוצאת covenant
- `CovenantBreach` — הפרת covenant

#### תחום 5: חשיפות וגידור (Exposure & Hedging)
- `ExposurePositions` — עמדות חשיפה
- `HedgePositions` — עמדות גידור
- `HedgeValuation` — הערכת גידור
- `DerivativeInstrument` — נגזרים
- `Counterparty` — צד נגדי
- `CounterpartyExposure` — חשיפה לצד נגדי

#### תחום 6: סיכונים ותרחישים (Risk & Scenarios)
- `FinancialRisks` — סיכונים פיננסיים
- `Risk` — סיכון כללי
- `Alert` — התראות
- `AlertRule` — כללי התראה
- `StressScenario` — תרחיש סטרס
- `StressAssumption` — הנחת סטרס
- `StressResult` — תוצאת סטרס

#### תחום 7: דוחות ובקרה (Reporting & Control)
- `ZeroReportVersions` — גרסאות דוח אפס
- `ProjectProfitabilitySnapshot` — תמונת רווחיות
- `CashFlowForecast` — תחזית תזרים
- `AuditTrail` — יומן ביקורת
- `FinancialEventLedger` — פנקס אירועים פיננסיים
- `FinancialPeriodLock` — נעילת תקופה
- `Approval` — בקשות אישור

### 2.2 קשרים מרכזיים (Relationships)

```
Project ──1:N── BudgetItem (project_id)
BudgetItem ──1:N── ContractLineItem (budget_line_id)
Contract ──1:N── ContractLineItem (contract_id)
Contract ──1:N── Invoice (contract_id)
Invoice ──1:N── InvoiceLineItem (invoice_id)
Invoice ──1:N── Payment (invoice_id)
Project ──1:N── Units (project_id)
Units ──1:1── SalesContracts (unit_id)
SalesContracts ──1:N── PaymentScheduleItem (sale_contract_id)
Project ──1:N── BankFacilities (project_id)
BankFacilities ──1:N── LoanTransactions (facility_id)
BankFacilities ──1:N── BankCovenant (facility_id)
Project ──1:N── ExposurePositions (project_id)
Project ──1:N── HedgePositions (project_id)
Project ──1:N── ZeroReportVersions (project_id)
Project ──1:N── CashFlowForecast (project_id)
Project ──1:N── FinancialEventLedger (project_id)
Project ──1:N── AuditTrail (project_id)
```

---

## חלק 3: מודול תקציב (Budget Module) — ביצוע מלא

### 3.1 מסכים במודול תקציב

| מסך | נתיב | תיאור |
|-----|------|-------|
| לוח בקרה תקציב | `/advanced-budget` | סקירה כללית: תקציב מקורי vs מעודכן vs בפועל |
| טבלת סעיפים | `/project/budget` | היררכיית סעיפים עם drill-down |
| פירוט סעיף | modal | התחייבויות, חשבוניות, תשלומים, שינויים |
| העברות תקציב | modal | העברה בין סעיפים |
| אישורי תקציב | `/approvals` | בקשות שינוי ממתינות |
| ניתוח סטיות | tab | סטייה מתקציב מקורי לפי קטגוריה |

### 3.2 טבלאות במודול תקציב

#### טבלה ראשית: `BudgetItem`

| שדה | סוג | תיאור | מקור נתונים |
|-----|-----|-------|-------------|
| `project_id` | string | פרויקט | ידני / אשף |
| `parent_budget_line_id` | string | סעיף אב | היררכיה |
| `budget_code` | string | קוד סעיף | ידני |
| `budget_name` | string | שם סעיף | ידני |
| `category` | enum | land/soft_costs/hard_costs/financing/contingency/marketing/... | ידני |
| `original_budget` | number | תקציב מקורי | אשף הזנה |
| `approved_budget` | number | תקציב מאושר | אישור IC |
| `revised_budget` | number | מעודכן = approved + העברות + שינויים | **חישוב אוטומטי** |
| `transferred_in` | number | הועבר פנימה | העברות |
| `transferred_out` | number | הועבר החוצה | העברות |
| `contingency_allocated` | number | בצ"מ מוקצה | ידני |
| `contingency_used` | number | בצ"מ בשימוש | **חישוב אוטומטי** |
| `committed_amount` | number | התחייבויות בחוזים | **חישוב אוטומטי** מ-ContractLineItem |
| `invoiced_amount` | number | חשבוניות | **חישוב אוטומטי** מ-InvoiceLineItem |
| `paid_amount` | number | שולם | **חישוב אוטומטי** מ-Payment |
| `open_invoice_amount` | number | חשבוניות פתוחות | invoiced - paid |
| `open_commitment_amount` | number | התחייבויות פתוחות | committed - invoiced |
| `approved_change_orders` | number | שינויים מאושרים | ChangeOrder |
| `pending_change_orders` | number | ממתינים | ChangeOrder |
| `price_change_impact` | number | השפעת שינויי מחירים | PriceChangeEvents |
| `estimated_remaining_cost` | number | אומדן להשלמה | **חישוב אוטומטי** |
| `forecast_at_completion` | number | FAC = paid + open_invoices + remaining | **חישוב אוטומטי** |
| `available_budget` | number | revised - committed | **חישוב אוטומטי** |
| `budget_variance` | number | FAC - revised | **חישוב אוטומטי** |
| `budget_variance_percent` | number | variance / revised * 100 | **חישוב אוטומטי** |
| `risk_level` | enum | low/medium/high/critical | **חישוב אוטומטי** מ-variance% |
| `status` | enum | planned/committed/executed/over_budget/revised/pending_approval/closed | **חישוב אוטומטי** |
| `last_calculated_at` | datetime | חישוב אחרון | מנוע |

#### טבלת משנה: `BudgetVersion`

| שדה | תיאור |
|-----|-------|
| `project_id` | פרויקט |
| `version_number` | מספר גרסה |
| `version_type` | original/approved/revised/forecast |
| `total_budget` | סה"כ תקציב בגרסה |
| `parent_version_id` | גרסת אב |
| `change_summary` | סיכום שינויים |
| `status` | draft/pending_approval/approved/superseded |

#### טבלת משנה: `ChangeOrder`

| שדה | תיאור |
|-----|-------|
| `budget_line_id` | סעיף מושפע |
| `change_type` | quantity/price/scope/addition/deletion |
| `old_value` | ערך ישן |
| `new_value` | ערך חדש |
| `difference` | הפרש |
| `reason` | סיבה |
| `approval_status` | pending/approved/rejected |
| `approval_level` | pm/pm_finance/cfo/ic/board |

### 3.3 נוסחאות חישוב אוטומטיות

```javascript
// 1. תקציב מעודכן
revised_budget = approved_budget 
               + transferred_in 
               - transferred_out 
               + approved_change_orders
               + contingency_used;

// 2. התחייבויות פתוחות
open_commitment_amount = committed_amount - invoiced_amount;

// 3. חשבוניות פתוחות
open_invoice_amount = invoiced_amount - paid_amount;

// 4. תקציב זמין
available_budget = revised_budget - committed_amount - open_invoice_amount;

// 5. תחזית לסיום (FAC)
forecast_at_completion = paid_amount 
                       + open_invoice_amount 
                       + estimated_remaining_cost
                       + price_change_impact;

// 6. סטיית תקציב
budget_variance = forecast_at_completion - revised_budget;
budget_variance_percent = (budget_variance / revised_budget) * 100;

// 7. רמת סיכון אוטומטית
if (budget_variance_percent > 15) risk_level = "critical";
else if (budget_variance_percent > 10) risk_level = "high";
else if (budget_variance_percent > 5) risk_level = "medium";
else risk_level = "low";

// 8. סטטוס אוטומטי
if (budget_variance_percent > 10) status = "over_budget";
else if (paid_amount > 0 && available_budget <= 0) status = "executed";
else if (committed_amount > 0) status = "committed";
else status = "planned";
```

### 3.4 זרימת נתונים — מאיפה נתונים מגיעים

```
מקורות קלט:
├── אשף הזנה (OnboardingWizard) → original_budget
├── ועדת השקעות (IC) → approved_budget
├── מודול חוזים (Contract) → committed_amount
│   └── ContractLineItem.quantity × ContractLineItem.unit_price
├── מודול חשבוניות (Invoice) → invoiced_amount
│   └── InvoiceLineItem.amount
├── מודול תשלומים (Payment) → paid_amount
├── מודוא שינויי מחירים (PriceChangeEvents) → price_change_impact
├── ChangeOrder → approved_change_orders
└── העברות תקציב → transferred_in / transferred_out
```

### 3.5 לאן הנתונים משפיעים

```
BudgetItem מזין:
├── ZeroReportEngine → total_project_cost, gross_profit, net_profit
├── CashFlowEngine → contractor_payments, supplier_payments (תזרים חודשי)
├── ProfitabilityEngine → total_cost, margin
├── RiskEngine → budget_overrun risk
├── AlertEngine → budget_overrun alert
├── ReportEngine → דוח תקציב, דוח סטיות
└── CovenantEngine → LTC (loan/cost), LTV (loan/value)
```

### 3.6 התראות שנוצרות

| טריגר | סוג | חומרה | תנאי |
|-------|-----|-------|------|
| `budget_overrun` | Alert | high | variance% > 10 |
| `budget_overrun` | Alert | critical | variance% > 15 |
| `commitment_exceeds_budget` | Alert | high | committed > revised |
| `contingency_depleted` | Alert | medium | contingency_used > 90% of allocated |
| `budget_line_blocked` | Alert | critical | available_budget ≤ 0 |
| `pending_change_order` | Alert | low | pending_change_orders > 0 |

### 3.7 משתמשים ואישורים

| פעולה | רמת אישור | מי מאשר |
|------|-----------|---------|
| יצירת סעיף תקציב | pm | מנהל פרויקט |
| שינוי תקציב עד 5% | pm_finance | מנהל פרויקט + פיננסים |
| שינוי תקציב 5-10% | cfo | CFO |
| שינוי תקציב > 10% | ic | ועדת השקעות |
| שינוי תקציב > 20% | board | דירקטוריון |
| העברה בין סעיפים | pm_finance | מנהל + פיננסים |
| שימוש בבצ"מ | cfo | CFO |
| פתיחת סעיף חדש | ic | ועדת השקעות |

### 3.8 דוחות שיוצאים

1. **דוח תקציב מקורי vs מעודכן vs בפועל** — לפי קטגוריה
2. **דוח סטיות** — variance% לפי סעיף, ממוין
3. **דוח התחייבויות פתוחות** — committed - invoiced
4. **דוח חשבוניות פתוחות** — invoiced - paid
5. **דוח FAC** — תחזית לסיום לכל סעיף
6. **דוח בצ"מ** — ניצול בלתי תקציבי
7. **דוח תקציב לבנק** — לפי דרישות הבנק המלווה

### 3.9 מה קורה כאשר יש שינוי בתקציב

```
1. משתמש מזין שינוי תקציב (ChangeOrder)
   ↓
2. נוצר אירוע פיננסי: budget_revision
   ↓
3. אישור לפי רמה (pm → cfo → ic → board)
   ↓
4. עם אישור → מנוע חישוב מופעל:
   ├── BudgetEngine: מעדכן revised_budget, available_budget, variance
   ├── ZeroReportEngine: מחשב מחדש total_project_cost, gross_profit, margin
   ├── ProfitabilityEngine: מעדכן total_cost, net_profit, IRR
   ├── CashFlowEngine: מעדכן תזרים חודשי צפוי
   ├── RiskEngine: בודק budget_overrun risk
   ├── AlertEngine: יוצר התראה אם variance > threshold
   └── AuditTrail: רושם מי, מתי, למה, ישן vs חדש
   ↓
5. בדיקת Covenants:
   └── CovenantEngine: בודק LTC, LTV (אם השינוי משפיע)
   ↓
6. נעילת תקופה:
   └── אם החודש נעול → דורש override_approved_by
```

### 3.10 מה קורה כאשר יש חשבונית

```
1. חשבונית נקלטת (ידני / OCR / intake)
   ↓
2. נוצר אירוע פיננסי: invoice_received
   ↓
3. Three-Way Match:
   ├── חוזה (Contract) ← חשבונית (Invoice) ← הזמנה (PO)
   ├── אם חריגה → נוצר PriceChangeEvent
   └── אם תואם → אישור אוטומטי
   ↓
4. מנוע חישוב:
   ├── BudgetEngine: invoiced_amount +=, open_invoice_amount +=, available_budget -=
   ├── CashFlowEngine: תזרים חודשי -= (תשלום צפוי)
   ├── ProfitabilityEngine: actual_cost +=
   ├── ZeroReportEngine: actual_cost += (אם גרסת actual)
   ├── ExposureEngine: אם חריגה → חשיפה חוזית
   └── AuditTrail: רישום מלא
   ↓
5. אם חריגת מחיר (price_difference > threshold):
   ├── PriceChangeEvents: נוצר רשומה
   ├── AlertEngine: התראה ל-CFO
   ├── RiskEngine: סיכון material_price
   └── ZeroReportEngine: impact_on_zero_report
   ↓
6. אישור תשלום:
   └── PaymentApproval workflow → Payment execution
```

### 3.11 מה קורה כאשר יש שינוי מחיר

```
1. שינוי מחיר מזוהה:
   ├── OCR של חשבונית / הצעת מחיר
   ├── אינטגרציית ספק (API)
   └── הזנה ידנית
   ↓
2. נוצר אירוע פיננסי: price_change
   ↓
3. PriceChangeEngine מחשב:
   ├── price_difference = new_price - old_price
   ├── price_change_percent = (difference / old_price) * 100
   ├── remaining_cost_impact = price_difference × remaining_quantity
   ├── impact_on_budget = remaining_cost_impact
   ├── impact_on_cashflow = remaining_cost_impact (בחודשים הבאים)
   ├── impact_on_profit = -remaining_cost_impact
   ├── impact_on_margin = impact_on_profit / revenue * 100
   ├── impact_on_zero_report = -remaining_cost_impact
   └── impact_on_covenants: אם profit יורד → covenant_breach_risk
   ↓
4. רמת אישור לפי חומרה:
   ├── < 2% → pm (אוטומטי)
   ├── 2-5% → pm_finance
   ├── 5-10% → cfo
   └── > 10% → ic
   ↓
5. מנועים מופעלים:
   ├── BudgetEngine: price_change_impact += remaining_cost_impact
   ├── ZeroReportEngine: total_cost +=, profit -=, margin -=
   ├── ProfitabilityEngine: actual_cost +=, profit -=
   ├── RiskEngine: material_price risk
   ├── ExposureEngine: חשיפה לעליית מחירים
   ├── AlertEngine: התראה לפי חומרה
   └── AI Engine: סיכום והמלצה
   ↓
6. בדיקת השפעה על Covenants:
   └── אם margin ירד מתחת ל-covenant → התראה קריטית
```

### 3.12 מה קורה כאשר יש חריגה

```
1. חריגה מזוהה (variance > threshold):
   ├── BudgetEngine: risk_level = high/critical
   ├── AlertEngine: התראה קריטית ל-CFO
   └── WarRoom: נפתח אירוע חירום (אם critical)
   ↓
2. ניתוח סיבת שורש:
   ├── AI: ניתוח מקור החריגה
   ├── PriceChangeEvents: שינויי מחירים
   ├── ChangeOrders: שינויי היקף
   └── Quantity variances: חריגות כמות
   ↓
3. פעולות מומלצות:
   ├── העברה מבצ"מ
   ├── משא ומתן עם ספק
   ├── שינוי היקף
   ├── הגדלת תקציב (דורש אישור)
   └── עדכון תחזית
   ↓
4. עדכון דוח אפס:
   └── אם החריגה משפיעה על רווחיות → גרסת דוח אפס חדשה
   ↓
5. בדיקת Covenants:
   └── אם LTC/LTV/DSCR נפגעו → התראה לבנק
```

---

## חלק 4: מודול תזרים מזומנים (Cash Flow Module)

### 4.1 מסכים

| מסך | תיאור |
|-----|-------|
| לוח בקרה תזרים | תזרים חודשי/רבעוני/שנתי עם תרשים |
| טבלת תקופות | פירוט לפי חודש: תקבולים, תשלומים, יתרה |
| ניתוח פער מימון | funding_gap = total_outflows - total_inflows |
| תכנון משיכות בנק | required_bank_drawdown לפי חודש |
| תרחישים | base/optimistic/pessimistic |
| תזרים 13 שבועות | טווח קצר (treasury) |

### 4.2 טבלה: `CashFlowForecast`

| שדה | תיאור | מקור |
|-----|-------|------|
| `opening_balance` | יתרת פתיחה | closing_balance חודש קודם |
| `buyer_collections` | תקבולי רוכשים | PaymentScheduleItem |
| `bank_drawdowns` | משיכות בנק | LoanTransactions (drawdown) |
| `equity_injections` | הון עצמי | CapitalCall |
| `loan_proceeds` | הלוואות בעלים | Loan |
| `vat_refunds` | החזרי מע"מ | חישוב |
| `contractor_payments` | תשלומי קבלנים | PaymentSchedule + Budget |
| `supplier_payments` | תשלומי ספקים | Payment |
| `land_payments` | רכישת קרקע | PaymentSchedule |
| `interest_payments` | ריבית | LoanTransactions |
| `loan_repayments` | החזרי הלוואות | LoanTransactions (repayment) |
| `total_inflows` | סה"כ תקבולים | **חישוב** |
| `total_outflows` | סה"כ תשלומים | **חישוב** |
| `net_cashflow` | תזרים נטו | inflows - outflows |
| `closing_balance` | יתרת סגירה | opening + net |
| `cumulative_cashflow` | מצטבר | **חישוב** |
| `funding_gap` | פער מימון | outflows - available_cash |
| `peak_exposure_flag` | שיא חשיפה | הנקודה הנמוכה ביותר |
| `decision_status` | healthy/monitor/warning/critical/block_payment | **חישוב** |

### 4.3 נוסחאות

```javascript
total_inflows = buyer_collections + bank_drawdowns + equity_injections 
              + loan_proceeds + vat_refunds + other_inflows;

total_outflows = contractor_payments + supplier_payments + consultant_payments
               + land_payments + tax_payments + interest_payments
               + loan_repayments + guarantee_fees + other_outflows;

net_cashflow = total_inflows - total_outflows;
closing_balance = opening_balance + net_cashflow;
cumulative_cashflow += net_cashflow;

funding_gap = Math.max(0, total_outflows - (opening_balance + total_inflows));
required_bank_drawdown = funding_gap;
required_equity = Math.max(0, funding_gap - available_credit);

// סטטוס החלטה
if (closing_balance < 0) decision_status = "block_payment";
else if (funding_gap > 0) decision_status = "critical";
else if (closing_balance < threshold) decision_status = "warning";
else if (cumulative_cashflow < 0) decision_status = "monitor";
else decision_status = "healthy";
```

### 4.4 מקורות נתונים

```
תקבולים:
├── PaymentScheduleItem (רוכשים) → buyer_collections
├── LoanTransactions (drawdown) → bank_drawdowns
├── CapitalCall → equity_injections
└── VAT refund (חישוב מע"מ) → vat_refunds

תשלומים:
├── Payment (קבלנים/ספקים) → contractor/supplier_payments
├── BudgetItem FAC → projected_outflows
├── LoanTransactions (repayment + interest) → loan_repayments + interest_payments
└── PaymentObligation → scheduled_outflows
```

---

## חלק 5: מודול דוח אפס (Zero Report Module)

### 5.1 מסכים

| מסך | תיאור |
|-----|-------|
| דוח אפס דינמי | גרסה נוכחית עם כל המרכיבים |
| השוואת גרסאות | base vs current, שינויים לפי סעיף |
| ניתוח השפעה | מה השתנה ולמה |
| ייצוא לדרייב | PDF ל-Google Drive |

### 5.2 טבלה: `ZeroReportVersions`

| שדה | תיאור | מקור |
|-----|-------|------|
| `version_type` | original/approved/forecast/actual/live | — |
| `total_land_cost` | קרקע + מס רכישה | BudgetItem (category=land) |
| `total_construction_cost` | בנייה + פיתוח | BudgetItem (hard_costs) |
| `total_soft_costs` | תכנון + יועצים + שיווק + משפטי | BudgetItem (soft_costs) |
| `total_financing_costs` | מימון + ריבית | BudgetItem (financing) |
| `total_tax_costs` | היטל השבחה + אגרות | BudgetItem (permits/tax) |
| `total_contingency` | בצ"מ | BudgetItem (contingency) |
| `total_guarantee_costs` | ערבויות | BudgetItem (guarantees) |
| `total_project_cost` | סה"כ | **חישוב** |
| `expected_revenue` | הכנסה צפויה | Units × list_price |
| `contracted_revenue` | מוזמנת | SalesContracts (signed) |
| `forecast_revenue` | תחזית | Units × updated_price |
| `gross_development_value` | GDV | **חישוב** |
| `gross_profit` | GDV - total_cost | **חישוב** |
| `development_margin` | profit / GDV * 100 | **חישוב** |
| `margin_on_cost` | profit / cost * 100 | **חישוב** |
| `irr` | IRR % | **חישוב** מתזרים |
| `npv` | NPV ₪ | **חישוב** מתזרים |
| `break_even_revenue` | נקודת איזון | = total_cost |
| `break_even_price_per_sqm` | מחיר איזון למ"ר | total_cost / total_sellable_sqm |

### 5.3 נוסחאות

```javascript
total_project_cost = total_land_cost 
                   + total_construction_cost 
                   + total_soft_costs 
                   + total_financing_costs 
                   + total_tax_costs 
                   + total_contingency 
                   + total_guarantee_costs;

gross_development_value = forecast_revenue; // או contracted + forecast
gross_profit = gross_development_value - total_project_cost;
development_profit = gross_development_value - total_project_cost; // זהה למעלה
development_margin = (gross_profit / gross_development_value) * 100;
margin_on_cost = (gross_profit / total_project_cost) * 100;

// IRR — מתזרים המזומנים החודשי
irr = calculateIRR(monthlyCashFlows); // נוסחת IRR איטרטיבית

// NPV
npv = monthlyCashFlows.reduce((npv, cf, i) => 
  npv + cf / Math.pow(1 + discount_rate, i/12), 0
);

break_even_revenue = total_project_cost;
break_even_price_per_sqm = total_project_cost / total_sellable_sqm;
```

### 5.4 מה מפעיל עדכון דוח אפס

```
טריגרים ליצירת/עדכון גרסת דוח אפס:
├── budget_revision (שינוי תקציב)
├── price_change (שינוי מחיר)
├── sale_signed (מכירה חדשה)
├── loan_drawdown (משיכת הלוואה)
├── index_update (עדכון מדד)
├── period_close (סגירת חודש)
└── manual (כפתור "צור גרסה")
```

---

## חלק 6: מודול בנק מלווה והלוואות (Banking & Loans Module)

### 6.1 מסכים

| מסך | תיאור |
|-----|-------|
| מסגרות אשראי | BankFacilities — סקירה |
| תנועות הלוואה | LoanTransactions — משיכות/פירעונות |
| לוח סילוקין | DebtSchedule |
| Covenants | סטטוס, בדיקות, הפרות |
| מחשבון ריבית | InterestCalculator |
| דוחות בנק | דוחות לפי דרישות בנק |

### 6.2 טבלה: `BankFacilities`

| שדה | תיאור |
|-----|-------|
| `facility_amount` | מסגרת מבוקשת |
| `approved_credit_line` | מאושרת |
| `utilized_amount` | מנוצלת (משיכות - פירעונות) |
| `available_credit` | זמין = approved - utilized |
| `interest_rate_type` | fixed/variable/cpi_linked |
| `base_rate` | ריבית בסיס |
| `spread` | מרווח |
| `all_in_interest_rate` | base + spread |
| `total_project_cost` | ל-LTC |
| `project_value` | ל-LTV |
| `cash_available_for_debt_service` | ל-DSCR |
| `annual_debt_service` | ל-DSCR |

### 6.3 נוסחאות בנקאיות

```javascript
// ניצול מסגרת
utilized_amount = sum(LoanTransactions where type=drawdown) 
                - sum(LoanTransactions where type=repayment);
available_credit = approved_credit_line - utilized_amount;

// LTC (Loan to Cost)
LTC = utilized_amount / total_project_cost;

// LTV (Loan to Value)
LTV = utilized_amount / project_value;

// DSCR (Debt Service Coverage Ratio)
DSCR = cash_available_for_debt_service / annual_debt_service;

// ריבית חודשית
monthly_interest = principal_balance * (all_in_interest_rate / 100 / 12);

// הצמדה (אם cpi_linked)
indexed_balance = principal_balance * (current_index / base_index);
indexation_adjustment = indexed_balance - principal_balance;
```

### 6.4 Covenants

| Covenant | נוסחה | סף |
|----------|-------|-----|
| LTC מקסימלי | loan / cost | ≤ 60% |
| LTV מקסימלי | loan / value | ≤ 70% |
| DSCR מינימלי | cash / debt_service | ≥ 1.2 |
| רווחיות מינימלית | profit / revenue | ≥ 15% |
| יחס שיעור מכירות | sold_units / total_units | ≥ 30% (למשיכה) |
| יתרת מזומן מינימלית | closing_balance | ≥ 500K ₪ |

### 6.5 מה קורה במשיכת הלוואה

```
1. בקשת משיכה → LoanTransactions (drawdown)
   ↓
2. בדיקת Covenants:
   ├── LTC ≤ 60%? 
   ├── LTV ≤ 70%?
   ├── DSCR ≥ 1.2?
   ├── יחס מכירות ≥ 30%?
   └── יתרת מזומן ≥ minimum?
   ↓
3. אם עובר → אישור אוטומטי (או ידני לפי סכום)
   אם לא → נסגר / דורש אישור בנק
   ↓
4. אירוע פיננסי: loan_drawdown
   ↓
5. מנועים:
   ├── CashFlowEngine: bank_drawdowns +=, closing_balance +=
   ├── TreasuryEngine: utilized_amount +=, available_credit -=
   ├── ExposureEngine: חשיפת ריבית (אם variable)
   ├── ProfitabilityEngine: financing_cost += (ריבית צפויה)
   ├── ZeroReportEngine: total_financing_costs +=
   ├── CovenantEngine: בדיקת LTC/LTV מחדש
   └── AuditTrail
```

---

## חלק 7: מודול חשיפות וגידור (Exposure & Hedging Module)

### 7.1 טבלאות

#### `ExposurePositions`
| שדה | תיאור |
|-----|-------|
| `exposure_type` | interest_rate/construction_index/cpi/currency/steel/concrete/... |
| `gross_exposure_amount` | סכום חשיפה |
| `sensitivity_factor` | כמה עולה ב₪ על כל 1% תזוזה |
| `stress_impact_1/2/3` | השפעת תרחיש סטרס |
| `status` | open/hedged/partially_hedged/expired/closed |

#### `HedgePositions`
| שדה | תיאור |
|-----|-------|
| `hedge_type` | fixed_rate/cap/swap/forward/price_lock/... |
| `exposure_type` | מגדר מה |
| `notional_amount` | סכום נומינלי |
| `hedge_rate` | שער/ריבית גידור |
| `market_rate` | שער שוק נוכחי |
| `hedge_ratio` | notional / gross_exposure * 100 |
| `unhedged_exposure` = gross - notional |
| `mark_to_market` | שווי שוק |
| `realized_pnl` | רווח/הפסד ממומש |
| `unrealized_pnl` = (market_rate - hedge_rate) × notional |

### 7.2 נוסחאות

```javascript
// יחס גידור
hedge_ratio = (notional_amount / gross_exposure_amount) * 100;
unhedged_exposure = gross_exposure_amount - notional_amount;

// יעילות גידור
hedge_effectiveness = (change_in_hedge_value / change_in_exposure_value) * 100;

// רווח/הפסד לא ממומש
unrealized_pnl = (market_rate - hedge_rate) * notional_amount;

// חשיפה שיורית
residual_risk = expected_value - mitigation_effect;
```

### 7.3 סוגי חשיפות וגידור

| חשיפה | מקור | גידור אפשרי |
|-------|------|-------------|
| ריבית משתנה | BankFacilities (variable) | Cap, Swap, ריבית קבועה |
| מדד תשומות בנייה | BudgetItem (index_linked) | הצמדה הפוכה, חוזה מחיר קבוע |
| CPI | חוזי מכר (cpi_linked) | הצמדה להוצאות |
| פלדה/בטון | BudgetItem (materials) | חוזה אספקה במחיר קבוע |
| מלאי לא מכור | Units (available) | קדם מכר |
| מטבע | רכישות דולריות | Forward |

---

## חלק 8: מודול סיכונים (Risk Module)

### 8.1 טבלה: `FinancialRisks`

| שדה | תיאור |
|-----|-------|
| `risk_category` | budget_overrun/material_price/interest_rate/sale_price_drop/... |
| `probability` | 0-1 |
| `impact_amount` | ₪ |
| `expected_value` = probability × impact |
| `worst_case_impact` | ₪ |
| `mitigation_plan` | תוכנית |
| `mitigation_cost` | ₪ |
| `mitigation_effect` | כמה מפחית |
| `residual_risk` = expected_value - mitigation_effect |
| `risk_level` | low/medium/high/critical |
| `severity_score` | 1-5 |
| `risk_score` = probability × severity |
| `status` | identified/assessed/mitigating/monitored/closed/materialized |

### 8.2 מטריצת סיכונים

```
           השפעה נמוכה    השפעה בינונית   השפעה גבוהה    השפעה קריטית
סבירות
גבוהה      🟡 medium       🟠 high          🔴 critical    🔴 critical
בינונית    🟢 low          🟡 medium        🟠 high         🔴 critical
נמוכה      🟢 low          🟢 low           🟡 medium       🟠 high
```

### 8.3 סוגי סיכונים אוטומטיים

```javascript
// 1. חריגת תקציב
if (budget_variance_percent > 10) {
  createRisk({
    risk_category: "budget_overrun",
    probability: 0.8,
    impact_amount: budget_variance,
    auto_generated: true,
    linked_entity_type: "BudgetItem",
    linked_entity_id: budget_item_id,
  });
}

// 2. עליית מדד
if (index_change > 3) {
  createRisk({
    risk_category: "indexation",
    probability: 0.7,
    impact_amount: exposed_amount * index_change / 100,
    auto_generated: true,
  });
}

// 3. ירידת מחירי מכירה
if (avg_price_drop > 5) {
  createRisk({
    risk_category: "sale_price_drop",
    probability: 0.6,
    impact_amount: unsold_units * avg_price_drop_per_unit,
  });
}

// 4. האטת מכירות
if (sales_velocity < planned_velocity * 0.7) {
  createRisk({ risk_category: "sales_slowdown", ... });
}

// 5. Covenant breach risk
if (LTC > 0.55) { // מתקרב ל-60%
  createRisk({ risk_category: "covenant_breach", ... });
}
```

---

## חלק 9: מודול מכירות ורוכשים (Sales Module)

### 9.1 טבלאות

#### `Units`
| שדה | תיאור |
|-----|-------|
| `list_price` | מחירון |
| `updated_price` | מעודכן |
| `sold_price` | מכירה בפועל |
| `status` | available/reserved/sold/blocked/cancelled |

#### `SalesContracts`
| שדה | תיאור |
|-----|-------|
| `contract_amount` | סכום חוזה |
| `discount_amount/percent` | הנחה |
| `indexation_type` | none/cpi/construction_index/fixed |
| `payments_received` | תקבולים |
| `balance_remaining` | יתרה |
| `collection_rate` = payments / contract * 100 |

#### `UnitProfitability`
| שדה | תיאור |
|-----|-------|
| `sale_price` | מחיר מכירה |
| `allocated_land_cost` | עלות קרקע מוקצית |
| `allocated_construction_cost` | עלות בנייה מוקצית |
| `allocated_financing_cost` | עלות מימון מוקצית |
| `total_allocated_cost` | סה"כ |
| `unit_profit` = sale_price - total_allocated_cost |
| `unit_margin` = profit / sale_price * 100 |

### 9.2 מה קורה בחתימת חוזה מכר

```
1. חוזה נחתם → SalesContracts (status=signed)
   ↓
2. אירוע פיננסי: sale_signed
   ↓
3. מנועים:
   ├── Units: status=sold, sold_price=contract_amount
   ├── SalesEngine: contracted_revenue +=, collection_rate
   ├── CashFlowEngine: buyer_collections += (לפי PaymentSchedule)
   ├── ProfitabilityEngine: revenue +=, profit recalc
   ├── ZeroReportEngine: contracted_revenue +=, GDV recalc
   ├── UnitProfitability: חישוב רווחיות יחידה
   ├── ExposureEngine: חשיפת "מלאי לא מכור" -=
   ├── CovenantEngine: יחס מכירות += (למשיכת הלוואה)
   └── AlertEngine: אם discount > threshold → אישור
   ↓
4. יצירת לוח תשלומים אוטומטי (PaymentScheduleItem)
```

---

## חלק 10: מנוע אירועים פיננסיים (Financial Event Engine)

### 10.1 טבלה: `FinancialEventLedger`

זהו **הלב של המערכת**. כל פעולה פיננסית יוצרת רשומה כאן.

| שדה | תיאור |
|-----|-------|
| `event_type` | budget_revision/invoice_received/payment_executed/sale_signed/... |
| `source_entity` | איזה מודול יצר |
| `source_entity_id` | מזהה רשומת מקור |
| `project_id` | פרויקט |
| `amount` | סכום ₪ |
| `direction` | inflow/outflow |
| `event_date` | מתי |
| `description` | תיאור |
| `impact_summary` | JSON: אילו מנועים הופעלו |
| `calculated` | boolean — האם המנוע כבר עיבד |
| `calculated_at` | מתי עובד |
| `calculation_log` | JSON: תוצאות חישוב |
| `reversed` | boolean |
| `reversal_reason` | סיבת ביטול |

### 10.2 תהליך עיבוד אירוע

```javascript
// כל אירוע עובר את המסלול הבא:

async function processFinancialEvent(event) {
  // 1. רישום בפנקס
  await FinancialEventLedger.create(event);
  
  // 2. בדיקת נעילת תקופה
  const periodLocked = await checkPeriodLock(event.project_id, event.event_date);
  if (periodLocked && !event.override_approved) {
    throw new Error("תקופה נעולה — נדרש אישור override");
  }
  
  // 3. הפעלת מנועים לפי סוג אירוע
  const engines = getEnginesForEvent(event.event_type);
  const results = {};
  
  for (const engine of engines) {
    try {
      results[engine.name] = await engine.process(event);
    } catch (err) {
      results[engine.name] = { error: err.message };
      await createAlert({
        trigger: "calculation_error",
        severity: "high",
        title: `שגיאת חישוב ב-${engine.name}`,
        message: err.message,
      });
    }
  }
  
  // 4. עדכון אירוע כמעובד
  await FinancialEventLedger.update(event.id, {
    calculated: true,
    calculated_at: new Date(),
    impact_summary: results,
  });
  
  // 5. רישום ב-AuditTrail
  await AuditTrail.create({
    action: "calculate",
    entity_name: "FinancialEventLedger",
    record_id: event.id,
    summary: `אירוע ${event.event_type} עובד`,
    is_financial: true,
  });
  
  return results;
}
```

### 10.3 מפת סוג אירוע → מנועים

```javascript
const EVENT_ENGINE_MAP = {
  budget_revision:      [BudgetEngine, ZeroReportEngine, ProfitabilityEngine, RiskEngine],
  budget_transfer:      [BudgetEngine, ZeroReportEngine],
  commitment_created:   [BudgetEngine, CashFlowEngine, ExposureEngine],
  invoice_received:     [BudgetEngine, CashFlowEngine, ProfitabilityEngine, ZeroReportEngine, PriceChangeEngine],
  payment_executed:     [CashFlowEngine, BudgetEngine, TreasuryEngine],
  sale_signed:          [SalesEngine, CashFlowEngine, ProfitabilityEngine, ZeroReportEngine, ExposureEngine, CovenantEngine],
  buyer_payment:        [CashFlowEngine, SalesEngine, ProfitabilityEngine],
  loan_drawdown:        [CashFlowEngine, TreasuryEngine, ExposureEngine, ProfitabilityEngine, ZeroReportEngine, CovenantEngine],
  loan_repayment:       [CashFlowEngine, TreasuryEngine],
  interest_accrual:     [TreasuryEngine, ProfitabilityEngine],
  index_update:         [BudgetEngine, SalesEngine, TreasuryEngine, ExposureEngine, ZeroReportEngine],
  price_change:         [BudgetEngine, ProfitabilityEngine, ZeroReportEngine, RiskEngine, ExposureEngine, AlertEngine],
  hedge_executed:       [ExposureEngine, RiskEngine, CashFlowEngine],
  covenant_test:        [CovenantEngine, AlertEngine, RiskEngine],
  period_lock:          [AllEngines], // freeze
};
```

---

## חלק 11: אוטומציות (Automations)

### 11.1 אוטומציות מתוזמנות (Scheduled)

| שם | תדירות | פונקציה | תיאור |
|----|--------|---------|-------|
| התראות יומיות | יומי 08:00 | `sendDailyAlerts` | שולח סיכום התראות למשתמשים |
| בדיקת בריאות | יומי 09:00 | `dailyHealthCheck` | בודק כל פרויקט: תקציב, תזרים, covenants |
| צבירת ריבית | חודשי 1st | — | interest_accrual לכל הלוואה |
| סנכרון מדדים | חודשי 15th | `fetchIndexRates` | מושך מדד תשומות, CPI |
| בדיקת Covenants | חודשי 1st | — | covenant_test לכל מסגרת |
| נעילת תקופה | חודשי 5th | — | lock לחודש שעבר |
| דוח שבועי | שבועי א' | `weeklyReport` | סיכום שבועי להנהלה |
| סנכרון בנקאי | יומי 06:00 | `bankSync` | משיכת תנועות בנק |
| גיבוי דרייב | שבועי | `driveBackup` | גיבוי נתונים |
| בדיקת תקציב | יומי | `budgetAlertMonitor` | בודק חריגות |
| בדיקת התראות | יומי | `alertsEngine` | מפעיל כללי התראות |
| צילום תמונת מצב | חודשי | `captureReturnSnapshot` | תמונת רווחיות חודשית |

### 11.2 אוטומציות ישות (Entity-Triggered)

| ישות | אירוע | פונקציה | תיאור |
|------|-------|---------|-------|
| `Invoice` | create | `intakeProcess` | עיבוד חשבונית → חישובים |
| `Payment` | create | `paymentBudgetAlert` | עדכון תקציב + התראה |
| `Payment` | create | `paymentRiskCheck` | בדיקת סיכון תשלום |
| `Sale` | create | — | עדכון מכירות + דוח אפס |
| `LoanTransactions` | create | — | עדכון מסגרת + תזרים |
| `PriceChangeEvents` | create | — | עדכון תקציב + רווחיות |
| `AuditTrail` | create | — | לוג ביקורת |
| `FinancialEventLedger` | create | — | הפעלת מנוע חישוב |

### 11.3 אוטומציות Webhook (Connector)

| קונקטור | אירוע | פונקציה | תיאור |
|---------|-------|---------|-------|
| Google Drive | file.update | `driveBackup` | סנכרון מסמכים |
| Google Calendar | events | — | תזכורות תשלומים |
| Gmail | mailbox | `gmailMessages` | קליטת חשבוניות מאימייל |
| Wix | order_created | — | סנכרון הזמנות מכירה |
| WhatsApp | — | `whatsappCloud` | שליחת התראות |

---

## חלק 12: הרשאות ואישורים (Permissions & Approvals)

### 12.1 תפקידים

| תפקיד | רמה | הרשאות עיקריות |
|-------|-----|----------------|
| `admin` | מערכת | הכל |
| `cfo` | הנהלה | כל מודולים פיננסיים, אישורים עד 10% |
| `finance_manager` | פיננסים | תקציב, תשלומים, דוחות |
| `project_manager` | פרויקט | תקציב (קריאה+עריכה עד 5%), חוזים, משימות |
| `sales_manager` | מכירות | מכירות, רוכשים, יחידות |
| `treasury` | אוצר | הלוואות, תזרים, בנק |
| `accountant` | חשבונאות | חשבוניות, תשלומים (קריאה) |
| `investor` | משקיע | דוחות בלבד (קריאה) |
| `bank` | בנק | דוחות בנק בלבד |
| `viewer` | צפייה | קריאה בלבד |

### 12.2 מטריצת אישורים

| פעולה | pm | finance | cfo | ic | board |
|------|----|---------|-----|-----|-------|
| שינוי תקציב ≤5% | ✅ | ✅ | — | — | — |
| שינוי תקציב 5-10% | — | ✅ | ✅ | — | — |
| שינוי תקציב 10-20% | — | — | ✅ | ✅ | — |
| שינוי תקציב >20% | — | — | — | ✅ | ✅ |
| תשלום ≤50K | ✅ | ✅ | — | — | — |
| תשלום 50K-200K | — | ✅ | ✅ | — | — |
| תשלום 200K-1M | — | — | ✅ | ✅ | — |
| תשלום >1M | — | — | — | ✅ | ✅ |
| הנחת מכירה ≤3% | ✅ | — | — | — | — |
| הנחת מכירה 3-7% | — | ✅ | ✅ | — | — |
| הנחת מכירה >7% | — | — | ✅ | ✅ | — |
| משיכת הלוואה | — | — | ✅ | — | — |
| פתיחת תקופה נעולה | — | — | ✅ | ✅ | — |
| ביטול אירוע פיננסי | — | — | ✅ | ✅ | — |

### 12.3 נעילת תקופה (Period Lock)

```
כללים:
1. חודש ננעל אוטומטית ב-5 לחודש שלאחריו
2. לאחר נעילה — אין עריכה ללא אישור override
3. כל override נרשם ב-AuditTrail עם:
   - override_approved_by
   - change_reason
   - old_value / new_value
4. override_count מצטבר לכל חודש
5. סגירה סופית (close_type=final) — אי אפשר לפתוח
```

---

## חלק 13: דוחות (Reports)

### 13.1 דוחות הנהלה

| דוח | תדירות | תוכן |
|-----|--------|------|
| דוח אפס | על פי עדכון | עלות, הכנסה, רווח, IRR, NPV |
| תזרים מזומנים | חודשי | תקבולים, תשלומים, יתרה, פער |
| רווחיות פרויקט | חודשי | רווח גולמי/נקי, margin, ROI |
| סטטוס תקציב | חודשי | מקורי vs מעודכן vs בפועל |
| סיכונים | רבעוני | מטריצת סיכונים, residual |
| Covenants | חודשי | סטטוס, הפרות |
| חשיפות וגידור | חודשי | חשיפה, hedge_ratio, PnL |
| דוח מכירות | חודשי | יחידות, מחיר ממוצע, הנחות |
| תחזית תזרים | חודשי | 12 חודשים קדימה |

### 13.2 דוחות בנק

| דוח | תוכן |
|-----|------|
| סטטוס מסגרת | utilized, available, LTC, LTV |
| לוח סילוקין | principal + interest schedule |
| DSCR | cash flow / debt service |
| סטטוס Covenants | compliance report |
| דוח התקדמות | % בנייה, תשלומים לקבלנים |
| דוח מכירות | יחידות שנמכרו, תקבולים |
| דוח ערבויות | ערבויות פעילות, עלות |

### 13.3 דוחות משקיעים

| דוח | תוכן |
|-----|------|
| סיכום תיק | פרויקטים פעילים, סטטוס |
| רווחיות | IRR, ROI, equity multiple |
| תזרים | הכנסות vs הוצאות |
| חלוקות | distributions למשקיע |
| NAV | שווי נכסי נקי |

### 13.4 דוחות אוטומטיים

```
דוחות שנוצרים אוטומטית:
├── חודשי (1 לחודש):
│   ├── דוח אפס מעודכן
│   ├── תזרים חודשי
│   ├── סטטוס Covenants
│   ├── רווחיות פרויקט
│   └── סיכום סיכונים
├── שבועי (יום א'):
│   ├── סיכום תקציב שבועי
│   ├── תזרים 13 שבועות
│   └── התראות פתוחות
├── רבעוני:
│   ├── דוח ועדת השקעות
│   ├── עדכון תחזית שנתית
│   └── סקירת סיכונים
└── שנתי:
    ├── דוח שנתי מלא
    ├── מאזן פרויקט
    └── דוח רואה חשבון
```

---

## חלק 14: תהליכים מקצה לקצה (End-to-End Processes)

### 14.1 תהליך: מהזדמנות לאכלוס

```
שלב 1: הזדמנות (Opportunity)
├── זיהוי קרקע
├── ניתוח כדאיות ראשוני
├── דירוג הזדמנות
└── שער החלטה: המשך / דחה
    ↓
שלב 2: בדיקת כדאיות (Due Diligence)
├── בדיקה משפטית (קרקע, בעלות)
├── בדיקה תכנונית (זכויות בנייה)
├── בדיקה סביבתית
├── הערכת עלות
└── שער: אישור השקעה
    ↓
שלב 3: ועדת השקעות (IC)
├── תחזית פיננסית (Pro Forma)
├── ניתוח רגישות
├── ניתוח סיכונים
├── אישור תקציב
└── שער: אישור ועדה
    ↓
שלב 4: רכישה (Acquisition)
├── חוזה רכישה
├── תשלום קרקע
├── רישום זכויות (טאבו)
├── מס רכישה
└── יצירת פרויקט במערכת
    ↓
שלב 5: תכנון והיתרים
├── היתר בנייה
├── אישורים (היטלים, אגרות)
├── תכנון מפורט
└── שער: היתר
    ↓
שלב 6: מימון
├── פנייה לבנק
├── אישור מסגרת אשראי
├── חוזה הלוואה
├── Covenants
└── שער: אישור מסגרת
    ↓
שלב 7: מכר�ס ורכש
├── מכרזי קבלנים
├── השוואת הצעות
├── חתימת חוזים
├── ערבויות קבלנים
└── שער: חוזים חתומים
    ↓
שלב 8: בנייה
├── תחילת עבודות
├── דוחות התקדמות
├── תשלומים לקבלנים (על בסיס התקדמות)
├── בקרת איכות
├── משיכות הלוואה (לפי התקדמות)
└── שער: גמר בנייה
    ↓
שלב 9: מכירות (מקביל לבנייה)
├── השקת מכירות
├── הסכמי מכר
├── תקבולי רוכשים
├── עדכון סטטוס יחידות
└── שער: 100% מכור
    ↓
שלב 10: אכלוס ומסירה
├── תעודת גמר (טופס 4)
├── מסירת יחידות
├── רישום טאבו לרוכשים
├── פירעון הלוואה
└── שער: סגירת פרויקט
    ↓
שלב 11: סגירה ודוחות
├── דוח אפס סופי
├── חישוב רווח סופי
├── דוח רואה חשבון
├── חלוקת רווחים
└── ארכוב
```

### 14.2 תהליך: מחשבונית לתשלום

```
1. קליטת חשבונית:
   ├── אימייל (Gmail connector) → OCR
   ├── העלאה ידנית
   ├── סריקה
   └── API ספק
   ↓
2. אינטייק (Intake):
   ├── סיווג אוטומטי (AI)
   ├── חילוץ נתונים (OCR)
   ├── מיפוי לחוזה + סעיף תקציב
   └── אישור ידני
   ↓
3. Three-Way Match:
   ├── חוזה (Contract) ← חשבונית (Invoice) ← הזמנה (PO)
   ├── בדיקת כמות
   ├── בדיקת מחיר
   └── בדיקת סכום
   ↓
4. אם חריגה:
   ├── PriceChangeEvent נוצר
   ├── התראה ל-CFO
   └── דורש אישור מיוחד
   ↓
5. אישור תשלום:
   ├── רמת אישור לפי סכום
   ├── בדיקת תזרים (יש מזומן?)
   ├── בדיקת תקציב (יש תקציב?)
   └── אישור / דחייה
   ↓
6. ביצוע תשלום:
   ├── יצירת Payment
   ├── אירוע פיננסי: payment_executed
   ├── עדכון BudgetItem (paid_amount)
   ├── עדכון CashFlow (outflow)
   ├── עדכון יתרה בנקאית (bankSync)
   └── רישום AuditTrail
   ↓
7. לאחר תשלום:
   ├── סגירת חשבונית
   ├── עדכון חוזה (paid_amount)
   ├── עדכון דוח אפס (אם גרסת actual)
   └── עדכון רווחיות
```

### 14.3 תהליך: ניהול Covenant Breach

```
1. זיהוי:
   ├── בדיקה חודשית אוטומטית
   ├── או: אירוע פיננסי מפעיל בדיקה
   └── CovenantTest נוצר
   ↓
2. חישוב:
   ├── LTC, LTV, DSCR, margin, etc.
   ├── השוואה לסף
   └── CovenantResult נוצר
   ↓
3. אם breach:
   ├── CovenantBreach נוצר
   ├── Alert קריטית ל-CFO + CEO
   ├── Risk: covenant_breach
   ├── הקפאת משיכות הלוואה (אוטומטית)
   └── דוח לבנק (אוטומטי / ידני)
   ↓
4. פעולת תיקון (Cure Action):
   ├── CovenantCureAction נוצר
   ├── אפשרויות:
   │   ├── הזרקת הון עצמי
   │   ├── הגדלת מסגרת (משא ומתן)
   │   ├── האצת מכירות
   │   ├── צמצום עלויות
   │   └── ויתור מהבנק (waiver)
   └── מעקב עד ריפוי
   ↓
5. ריפוי:
   ├── בדיקה חוזרת
   ├── סגירת breach
   ├── דוח לבנק
   └── שחרור הקפאה
```

---

## חלק 15: אינטגרציות (Integrations)

### 15.1 אינטגרציות פעילות

| שירות | סוג | שימוש |
|-------|-----|-------|
| Google Drive | OAuth | שמירת דוחות, גיבויים |
| Google Sheets | OAuth | ייבוא נתוני שוק, מדדים |
| Google Calendar | OAuth | תזכורות, ישיבות, מועדי תשלום |
| Google Docs | OAuth | פרוטוקולים, מזכרים |
| Gmail (9 חשבונות) | OAuth | קליטת חשבוניות, התכתבות |
| Airtable | OAuth | סנכרון טבלאות |
| Wix | OAuth | אתר מכירות, טפסים |
| WhatsApp Cloud | API | התראות, עדכונים |
| n8n | API | אוטומציות workflow |
| Bank API | API | סנכרון תנועות, יתרות |

### 15.2 זרימת נתונים מאינטגרציות

```
Gmail → חשבונית → IntakeProcess → FinancialEvent
Sheets → מדד שוק → IndexRate → FinancialEvent (index_update)
Drive → מסמך → Document entity
Wix → הזמנת רוכש → Sale → FinancialEvent (sale_signed)
Bank API → תנועה → Transaction → FinancialEvent
WhatsApp ← התראה ← AlertEngine
n8n ← trigger ← FinancialEvent → סנכרון למערכות חיצוניות
```

---

## חלק 16: AI ואוטומציה חכמה

### 16.1 סוכני AI

| סוכן | תפקיד | כלים |
|------|-------|------|
| `financial_modeler` | בניית מודלים פיננסיים | FinancialModel, InvokeLLM |
| `risk_officer` | ניתוח סיכונים | FinancialRisks, Alert, InvokeLLM |
| `investment_analyst` | ניתוח השקעות | ProForma, Scenario, InvokeLLM |
| `treasury_hedge_advisor` | ייעוץ גידור | HedgePositions, ExposurePositions |
| `market_analyst` | ניתוח שוק | MarketData, MacroIndicator |

### 16.2 שימושי AI

```
1. סיווג חשבוניות אוטומטי (OCR + AI)
2. זיהוי חריגות מחיר (anomaly detection)
3. תחזית תזרים (ML)
4. ניתוח סיכונים (AI risk assessment)
5. המלצות גידור (AI hedge advisor)
6. סיכום דוחות (AI CFO)
7. ניתוח רגישות אוטומטי
8. זיהוי הונאות (fraud detection)
9. הערכת שווי (valuation)
10. ניתוח חוזים (contract analysis)
```

---

## חלק 17: בקרת איכות נתונים (Data Quality)

### 17.1 כללי איכות

| כלל | תיאור | פעולה |
|-----|-------|-------|
| שלמות | שדות חובה מלאים | DataQualityIssue |
| עקביות | סכומים תואמים בין ישויות | ValidationIssue |
| תקינות | ערכים בטווח הגיוני | ValidationIssue |
| עדכניות | נתונים מעודכנים | Alert |
| ייחודיות | אין כפילויות | DataQualityIssue |

### 17.2 בדיקות אוטומטיות

```javascript
// 1. התאמת חשבונית לחוזה
if (invoice_total > contract_remaining) {
  createValidationIssue({ type: "invoice_exceeds_contract" });
}

// 2. התאמת תשלום לתקציב
if (payment_amount > budget_available) {
  createValidationIssue({ type: "payment_exceeds_budget" });
}

// 3. מאזן תזרים
if (closing_balance < 0) {
  createAlert({ trigger: "negative_cashflow" });
}

// 4. סכום חשבוניות = סכום פריטים
if (invoice_total !== sum(line_items)) {
  createValidationIssue({ type: "invoice_total_mismatch" });
}
```

---

## חלק 18: סיכום — כללי המערכת

### 18.1 10 העקרונות המנחים

1. **כל פעולה כספית יוצרת אירוע** — אין עדכון ישיר של ישויות פיננסיות
2. **מנוע מרכזי** — כל חישוב עובר דרך ה-Engine, לא ב-frontend
3. **Audit Trail מלא** — כל שינוי נרשם: מי, מתי, ישן, חדש, סיבה
4. **נעילת תקופה** — אי אפשר לשנות עבר ללא אישור
5. **אישורים לפי סכום** — ככל שהסכום גדול, האישור גבוה יותר
6. **Covenants זמן אמת** — כל אירוע מפעיל בדיקת covenant
7. **התראות אוטומטיות** — כל חריגה מייצרת התראה
8. **גרסאות דוח אפס** — כל שינוי משמעותי יוצר גרסה
9. **סנכרון דו-כיווני** — אינטגרציות מקבלות ושולחות נתונים
10. **AI מסייע** — סיווג, זיהוי חריגות, המלצות — אבל האדם מאשר

### 18.2 סדר בנייה מומלץ

```
פאזה 1 (בסיס): ישויות + מנוע אירועים + AuditTrail
פאזה 2 (תקציב): BudgetItem + ChangeOrder + BudgetEngine
פאזה 3 (חשבוניות/תשלומים): Invoice + Payment + Three-Way Match
פאזה 4 (תזרים): CashFlowForecast + CashFlowEngine
פאזה 5 (דוח אפס): ZeroReportVersions + ZeroReportEngine
פאזה 6 (מכירות): Units + SalesContracts + SalesEngine
פאזה 7 (בנק): BankFacilities + LoanTransactions + CovenantEngine
פאזה 8 (חשיפות/גידור): ExposurePositions + HedgePositions
פאזה 9 (סיכונים): FinancialRisks + StressScenario + RiskEngine
פאזה 10 (דוחות/BI): ReportEngine + Dashboards
פאזה 11 (AI): סוכנים + אוטומציה חכמה
פאזה 12 (אינטגרציות): Gmail, Drive, WhatsApp, n8n, Bank
```

---

*מסמך זה הוא מפרט חי — מתעדכן עם כל שינוי במערכת.*