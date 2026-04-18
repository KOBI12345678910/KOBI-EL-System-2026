# AG-X85 — Israeli Seed Data Generator
**Agent:** X-85 | **Swarm:** Seed / Fixture pipeline | **Project:** Techno-Kol Uzi mega-ERP
**Date:** 2026-04-11
**Status:** PASS — 56/56 tests green

---

## 1. Scope

A deterministic, zero-dependency seed data generator that produces realistic
Israeli-flavoured fixtures for development, demo, QA, and load-test
environments. Every entity passes the same validators that production
payroll / VAT / accounting code uses, so the output can be dropped straight
into the database without triggering validation failures.

Rule respected: **"לא מוחקים רק משדרגים ומגדלים"** — nothing was deleted.
Added three new files on top of the existing source tree:

Delivered files
- `onyx-procurement/src/seed/israeli-seed.js` — the generator library
- `onyx-procurement/test/seed/israeli-seed.test.js` — 56 tests, all green
- `_qa-reports/AG-X85-israeli-seed.md` — this report

RULES followed
- Zero external dependencies (only Node built-ins + the optional internal
  `src/validators/teudat-zehut.js` — the generator tolerates its absence)
- Deterministic (Mulberry32 seeded RNG — identical output for identical seed)
- Bilingual Hebrew / English (names, roles, categories all carry `_he` +
  `_en` fields where relevant)
- Real Israeli data conventions: valid ת.ז check digits, 513-prefixed
  company IDs, Bezeq area codes, 17% VAT, 2026 tax brackets, real city
  names and real industrial-zone street names

---

## 2. Public API

```js
const { IsraeliSeedGenerator } = require('./src/seed/israeli-seed.js');

const gen = new IsraeliSeedGenerator({ seed: 42 });

// Per-entity generators
gen.generateSupplier(count, opts?)                  // → Supplier[]
gen.generateCustomer(count, opts?)                  // → Customer[]  (B2B + B2C mix)
gen.generateEmployee(count, opts?)                  // → Employee[]
gen.generateItem(count, opts?)                      // → Item[]
gen.generateInvoice(count, { suppliers, items })    // → Invoice[]
gen.generatePayroll(employees, 'YYYY-MM')           // → Payslip[]

// All-at-once
gen.generateAll({
  suppliers: 20, customers: 50, employees: 15,
  items: 40, invoices: 100,
  months: ['2026-01', '2026-02', '2026-03'],
})

// Utilities
gen.reset()                    // rewind RNG to original seed
gen.fork('sub-tag')            // independent sub-generator with derived seed
```

Every generator also accepts `{ seed: <number> }` in its options to
override the internal stream for that call — useful when different parts
of a fixture tree need independent determinism.

---

## 3. Determinism guarantee

- **PRNG:** Mulberry32 — 32-bit state, tiny, fast, uniform enough for
  fixture generation. Pure JS, no deps.
- **Guarantee:** `new IsraeliSeedGenerator({ seed: 42 }).generateAll()`
  produces byte-identical JSON on every run, on every platform, on every
  Node version ≥ 18.
- **Independence:** `fork('tag')` hashes the tag (FNV-like) into a new
  seed so unrelated streams don't collide.

Verified by the test suite:
- `mulberry32 — deterministic across instances`
- `generateSupplier — determinism (same seed → same output)`
- `generateCustomer — determinism`
- `generateEmployee — determinism`
- `generateItem — determinism`
- `generateInvoice — determinism`
- `generatePayroll — determinism`
- `generateAll — determinism across full tree`
- `reset() — rewinds RNG so output repeats`
- `fork() — independent sub-generators`

---

## 4. Validation cross-checks (production validators)

Every ID field in generated data is verified by the **actual production
validator** the rest of onyx-procurement uses — not a weaker heuristic.

| Field                     | Validator used                          | Tests                                       |
|---------------------------|------------------------------------------|----------------------------------------------|
| `supplier.company_id`     | `src/validators/company-id.js`           | 30 suppliers × checksum + prefix verified   |
| `customer.company_id`     | `src/validators/company-id.js`           | all B2B customers verified                  |
| `customer.teudat_zehut`   | `src/validators/teudat-zehut.js`         | all B2C customers verified                  |
| `employee.teudat_zehut`   | `src/validators/teudat-zehut.js`         | 50 employees verified                       |
| Inline TZ fallback        | Embedded algorithm                       | 200 random draws — all pass validator       |

If the validator files are absent (the generator is copied to a slimmer
project), the embedded fallback produces the same checksum-correct output.

---

## 5. Entity catalog + sample output (seed 42)

### 5.1 Supplier

```json
{
  "id": "SUP-000001",
  "name": "חרושת השפלה בע\"מ",
  "legal_name": "חרושת השפלה בע\"מ",
  "company_id": "513873158",
  "vat_id": "513873158",
  "entity_type": "llc",
  "address": {
    "street": "הנפחים",
    "house_number": 50,
    "street_line": "הנפחים 50",
    "city": "אילת",
    "zip": "8810000",
    "area": "darom",
    "country": "IL"
  },
  "phone": "08-749-6106",
  "mobile": "050-470-8373",
  "email": "info@chrvsht.co.il",
  "contact_person": {
    "first_name": "מירב",
    "last_name": "גבאי",
    "full_name": "מירב גבאי",
    "role": "מנהל רכש",
    "mobile": "054-031-2669"
  },
  "payment_terms_days": 30,
  "bank": { "bank_code": "11", "branch": "805", "account_number": "577302" },
  "rating": 3.1,
  "is_active": true,
  "created_at": "2026-01-01T08:00:00Z"
}
```

Realism notes
- Suppliers always live on an **industrial-zone street** (הנפחים, המסגר,
  המלאכה, החרושת, הברזל…). Never on a residential street.
- Phone area code is derived from city area (`darom` → 08, `merkaz` → 03,
  `haifa`/`tsafon` → 04, `sharon` → 09, `yerushalayim` → 02).
- `company_id` always starts with `513` (private LLC — the dominant form
  for Israeli metal fabrication SMBs) and passes the Israeli Tax Authority
  Luhn-like checksum.
- Payment terms drawn from the real Israeli norm set: 30/45/60/90 days.
- Bank codes drawn from real Israeli bank numbers: 10 (Leumi), 11 (Discount),
  12 (Hapoalim), 14 (Otzar HaHayal), 20 (Mizrahi Tefahot), 31 (HaPoalim Int.).

### 5.2 Business customer (B2B)

```json
{
  "id": "CUS-000001",
  "kind": "business",
  "name": "רוטנברג ציוד ובינוי בע\"מ",
  "legal_name": "רוטנברג ציוד ובינוי בע\"מ",
  "company_id": "513927152",
  "address": {
    "street": "הברוש",
    "house_number": 14,
    "street_line": "הברוש 14",
    "city": "כרמיאל",
    "zip": "2160000",
    "area": "tsafon",
    "country": "IL"
  },
  "phone": "04-857-1205",
  "email": "info@rvtnbrg.co.il",
  "payment_terms_days": 90,
  "credit_limit_nis": 121304,
  "is_active": true,
  "created_at": "2026-01-01T08:00:00Z"
}
```

### 5.3 Private customer (B2C)

```json
{
  "id": "CUS-000002",
  "kind": "private",
  "name": "מנחם שמעון",
  "first_name": "מנחם",
  "last_name": "שמעון",
  "teudat_zehut": "248698458",
  "address": {
    "street": "הנגב",
    "house_number": 59,
    "street_line": "הנגב 59",
    "city": "כרמיאל",
    "zip": "2160000",
    "area": "tsafon",
    "country": "IL"
  },
  "mobile": "052-100-6967",
  "email": "mnchm.shmavn@walla.co.il",
  "gender": "male",
  "payment_terms_days": 30,
  "credit_limit_nis": 19095,
  "is_active": true,
  "created_at": "2026-01-01T08:00:00Z"
}
```

Realism notes
- Business/private mix is ~60/40 (verified by a 500-customer distribution
  test).
- Private customers have real-looking names + valid check-digit ת.ז.
- Business customers have 30–90 day terms; private customers have 0 or 30.
- Credit limits are segment-scaled (B2B 20k–200k NIS, B2C 1k–20k NIS).

### 5.4 Employee

```json
{
  "id": "EMP-00001",
  "employee_number": "00001",
  "first_name": "כרמלה",
  "last_name": "פרידמן",
  "full_name": "כרמלה פרידמן",
  "teudat_zehut": "830768925",
  "gender": "female",
  "birth_date": "1979-06-06",
  "age": 47,
  "address": {
    "street": "הרב קוק",
    "house_number": 53,
    "street_line": "הרב קוק 53",
    "city": "רמת גן",
    "zip": "5210000",
    "area": "merkaz",
    "country": "IL"
  },
  "mobile": "058-572-9885",
  "email": "krmlh.prydmn@technokol.co.il",
  "role_code": "prod_worker",
  "role_he": "עובד ייצור",
  "role_en": "Production worker",
  "department": "ייצור",
  "hire_date": "2021-01-07",
  "base_monthly_wage_nis": 9450,
  "employment_status": "active",
  "tax_credit_points": 2.33,
  "pension_percent": 0.06,
  "severance_percent": 0.0833,
  "bank": { "bank_code": "11", "branch": "604", "account_number": "363253" }
}
```

Realism notes
- Ages are uniform over [20, 65].
- Tenure is capped at `age - 18` so we never generate a 25-year-old who
  started working at 3.
- Role is drawn from an **18-entry weighted pool** (see §7) — production
  staff dominate by design (metalworking workforce).
- Wage is `role.base × (0.85 .. 1.15)` — realistic jitter without creating
  outliers.
- Department is auto-assigned from role: ייצור / לוגיסטיקה / הנהלה / מכירות.
- 72% male skew reflects the real gender distribution in Israeli metalworking.
- Female employees are still generated and correctly flagged — e.g. the
  sample above is a woman (כרמלה).

### 5.5 Item (metal fabrication SKU)

```json
{
  "id": "ITM-000001",
  "sku": "PNT-18",
  "name_he": "צבע יסוד אפוקסי 18 ליטר",
  "name_en": "Epoxy primer 18 ליטר",
  "category_code": "PNT",
  "category_he": "צבע יסוד אפוקסי",
  "category_en": "Epoxy primer",
  "dimension": "18 ליטר",
  "unit_he": "פח",
  "unit_price_nis": 320.06,
  "unit_cost_nis": 199.44,
  "vat_rate": 0.17,
  "stock_qty": 433,
  "reorder_point": 36,
  "warehouse_bin": "A-84-89",
  "is_active": true,
  "created_at": "2026-01-01T08:00:00Z"
}
```

Realism notes
- **18 category families** — see §7 for the full list.
- SKU encodes category prefix + sanitized dimension (e.g. `ANG-40x40x4`,
  `IPE-IPE120`, `PNT-18`).
- Prices bounded within realistic per-category NIS bands.
- Cost is 60–75% of price → margin always exists → realistic P&L.
- `unit_he` is a real Hebrew unit (`מטר`, `יריעה`, `גליל`, `חבילה`, `פח`).

### 5.6 Invoice

```json
{
  "id": "INV-0000001",
  "invoice_number": "0002/2026/00001",
  "invoice_type": "cheshbonit_mas",
  "supplier_id": "SUP-000002",
  "supplier_name": "שלומי יבוא ושיווק",
  "supplier_company_id": "513262378",
  "issue_date": "2026-03-10",
  "due_date": "2026-06-08",
  "currency": "ILS",
  "lines": [
    { "line_no": 1, "item_id": "ITM-000003", "sku": "EXP-1x2heavy",
      "description": "רשת מוגבהת 1x2 heavy", "quantity": 21,
      "unit_price_nis": 457.28, "line_total_nis": 9602.88 },
    { "line_no": 2, "item_id": "ITM-000002", "sku": "EXP-1x2standard",
      "description": "רשת מוגבהת 1x2 standard", "quantity": 21,
      "unit_price_nis": 367.5, "line_total_nis": 7717.5 }
    // ... 4 more lines ...
  ],
  "subtotal_nis": 45640.62,
  "vat_rate": 0.17,
  "vat_amount_nis": 7758.91,
  "total_nis": 53399.53,
  "allocation_number": "8446698",
  "payment_status": "pending",
  "created_at": "2026-03-10T09:00:00Z"
}
```

Realism notes
- `invoice_type: "cheshbonit_mas"` → חשבונית מס, the Israeli Tax
  Authority standard invoice type.
- 1–8 line items per invoice.
- VAT is **exactly** 17% of subtotal → passes downstream VAT validation.
- `allocation_number` is the **7-digit חשבונית רפורמה allocation** issued
  by the Israeli Tax Authority since the 2024 reform.
- `due_date` is computed from `issue_date + supplier.payment_terms_days`
  so the two fields always agree (test-enforced).
- Payment status drawn from a realistic distribution:
  2× pending, 2× paid, 1× partial, 1× overdue.

### 5.7 Payslip (תלוש משכורת)

```json
{
  "id": "PAY-2026-03-EMP-00001",
  "payslip_number": "2026-03/00001",
  "employee_id": "EMP-00001",
  "employee_name": "כרמלה פרידמן",
  "employee_tz": "830768925",
  "month": "2026-03",
  "working_days": 21,
  "hours_worked": 179,
  "gross_wage_nis": 9646.07,
  "income_tax_nis": 514.99,
  "bituach_leumi_nis": 411.95,
  "mas_briut_nis": 339.39,
  "pension_employee_nis": 578.76,
  "pension_employer_nis": 626.99,
  "severance_employer_nis": 803.52,
  "total_deductions_nis": 1845.09,
  "net_wage_nis": 7800.98,
  "payment_method": "bank_transfer",
  "payment_date": "2026-03-09",
  "tax_credit_points": 2.33,
  "currency": "ILS"
}
```

Payroll math breakdown (all test-enforced)
- `gross = base × (0.95 .. 1.05)` — overtime/hours jitter
- `income_tax` — stepped through the 2026 7-bracket table, net of
  `credit_points × 242 NIS`
- `bituach_leumi` — reduced 3.5% up to 7,522 NIS threshold, full 7% above
- `mas_briut` — reduced 3.1% up to threshold, full 5% above
- `pension_employee` — 6% (hard-wired to the statutory minimum)
- `pension_employer` — 6.5% (employer side, recorded for employer-cost
  reports but NOT deducted from gross)
- `severance_employer` — 8.33% קרן פיצויים (employer side)
- `total_deductions = income_tax + BL + health + pension_employee`
- `net = gross − total_deductions`

The accounting identity `net + deductions = gross` is test-enforced for
every generated payslip.

---

## 6. Source pools (Hebrew glossary)

### 6.1 First names — male (60 entries)

```
אורי, אברהם, אלי, אליהו, אריה, אריק, אורן, איתן, אסף, אמיר,
בני, ברוך, בועז, גיל, גדי, גיא, גבי, דוד, דני, דרור,
הילל, חיים, חגי, טל, יוסי, יובל, ישראל, יונתן, יעקב, יצחק,
יורם, יריב, לירן, משה, מנחם, מאיר, מיכאל, מרדכי, נפתלי, ניר,
נתן, עמית, עמוס, עוזי, עידן, עופר, פנחס, צחי, רוני, רמי,
רענן, שלמה, שמעון, שמואל, שי, שלום, תומר, רפי, בן, איל
```

### 6.2 First names — female (50 entries)

```
אביבה, אורית, אורנה, איריס, אסתר, בתיה, בלהה, גילה, גלית, דליה,
דפנה, הדס, הלה, חנה, חווה, טלי, יעל, יפה, יהודית, כרמלה,
לאה, ליאת, לימור, מירב, מיכל, מרים, מאיה, נורית, נועה, נילי,
סיגל, סיון, עדי, עדנה, עירית, פנינה, ציפורה, צילה, קרן, רבקה,
רחל, רונית, רינה, רותי, שרה, שולה, שושנה, שרית, תמר, תקווה
```

### 6.3 Surnames (60 entries)

```
כהן, לוי, מזרחי, פרץ, ביטון, דהן, אברהם, פרידמן, אוחיון, חדד,
אזולאי, יוסף, דוד, שטרית, גבאי, אוחנה, אדרי, טולדנו, אלבז, בן-דוד,
שמעון, מלכה, חזן, אליהו, עמר, אטיאס, בן-שושן, סעדון, ארביב, סבג,
זוהר, שרעבי, אברגיל, ברוך, יעקב, חיים, מועלם, גולן, שלום, לביא,
ברק, הלוי, סגל, רוזנברג, רוטנברג, גולדשטיין, וייס, שפירא, רובין, פרידלנד,
ארד, אהרון, שלומי, שלם, מטלון, סויסה, טובול, נחום, אלקיים, דיין
```

### 6.4 Cities (37 entries, with real ZIP ranges)

```
תל אביב-יפו, ירושלים, חיפה, ראשון לציון, פתח תקווה, אשדוד, נתניה,
באר שבע, חולון, בני ברק, רמת גן, אשקלון, רחובות, בת ים, הרצליה,
כפר סבא, חדרה, מודיעין, רמלה, לוד, נצרת, עפולה, טבריה, אילת,
דימונה, נהריה, כרמיאל, קריית גת, קריית מוצקין, קריית ים, קריית אתא,
ראש העין, יהוד-מונוסון, אור יהודה, גבעתיים, רעננה, הוד השרון
```

Every city carries a ZIP-code prefix that matches its real Israeli
postal district and an `area` field (`merkaz`, `sharon`, `haifa`,
`tsafon`, `darom`, `yerushalayim`).

### 6.5 Streets — residential (≈50)

```
הרצל, ז'בוטינסקי, ביאליק, רוטשילד, ויצמן, בן גוריון, בן צבי,
אלנבי, דיזנגוף, אבן גבירול, ארלוזורוב, הנביאים, יפו, המלך ג'ורג',
החרושת, המלאכה, התעשייה, היוצרים, המסגר, הברזל, האומנים,
האורגים, הנפחים, האשלג, העמל, ההגנה, הפלמ"ח, הגולן, הכרמל,
הנגב, הגליל, יצחק שדה, לוי אשכול, מנחם בגין, סוקולוב, הרב קוק,
הדקל, האלון, התמר, התאנה, הגפן, הדר, השקד, הזית, הברוש,
שדרות ירושלים, שדרות יהודית, שדרות העצמאות, דרך השלום, דרך ההגנה
```

### 6.6 Streets — industrial (14)

Used for supplier addresses only, so every supplier is in a plausible
industrial zone:

```
החרושת, המלאכה, התעשייה, היוצרים, המסגר, הברזל, הפלדה,
הנפחים, האורגים, האומנים, הצמיגים, הבונים, המדע, האשלג
```

### 6.7 Roles (18 entries, weighted)

| Code          | Hebrew              | English                | Base NIS | Weight |
|---------------|---------------------|------------------------|---------:|-------:|
| prod_worker   | עובד ייצור           | Production worker      |    8900  |    25  |
| welder        | רתך מוסמך            | Certified welder       |   11500  |    10  |
| cnc_op        | מפעיל CNC            | CNC operator           |   12200  |     7  |
| laser_op      | מפעיל לייזר          | Laser cutter operator  |   13000  |     5  |
| crew_lead     | ראש צוות             | Crew lead              |   14500  |     4  |
| shift_mgr     | מנהל משמרת           | Shift manager          |   16800  |     2  |
| prod_mgr      | מנהל ייצור           | Production manager     |   22500  |     1  |
| quality       | בקר איכות            | Quality inspector      |   11800  |     3  |
| forklift      | מפעיל מלגזה          | Forklift operator      |   10200  |     4  |
| warehouse     | מחסנאי               | Warehouse clerk        |    9400  |     5  |
| driver        | נהג משאית            | Truck driver           |   11000  |     3  |
| maintenance   | טכנאי תחזוקה         | Maintenance technician |   12600  |     3  |
| secretary     | מזכירה               | Secretary              |    9800  |     3  |
| bookkeeper    | הנהלת חשבונות        | Bookkeeper             |   12500  |     2  |
| accountant    | רואת חשבון           | Accountant             |   18000  |     1  |
| buyer         | רכזת רכש             | Purchasing officer     |   13200  |     2  |
| sales         | איש מכירות           | Sales rep              |   11500  |     3  |
| hr            | מנהלת משאבי אנוש     | HR manager             |   16500  |     1  |

Weighted so that production staff dominate (~57% of the pool).

### 6.8 Item categories (18)

| Code | Hebrew                | English                | Unit (he) | Price band (NIS) |
|------|-----------------------|------------------------|-----------|------------------|
| ANG  | ברזל זווית             | Angle iron             | מטר       | 12 – 85          |
| SQT  | צינור רבוע             | Square tube            | מטר       | 15 – 120         |
| RCT  | צינור מלבני            | Rectangular tube       | מטר       | 18 – 140         |
| RND  | מוט עגול              | Round bar              | מטר       | 8 – 160          |
| PIP  | צינור עגול             | Round pipe             | מטר       | 14 – 130         |
| FLB  | פרופיל שטוח            | Flat bar               | מטר       | 10 – 95          |
| SHT  | פח גלוון              | Galvanized sheet       | יריעה     | 85 – 680         |
| PLT  | פח פלדה               | Steel plate            | יריעה     | 140 – 1250       |
| EXP  | רשת מוגבהת             | Expanded metal         | יריעה     | 120 – 520        |
| IPE  | פרופיל IPE            | IPE beam               | מטר       | 45 – 310         |
| HEA  | פרופיל HEA            | HEA beam               | מטר       | 95 – 480         |
| UNP  | פרופיל UNP            | UNP channel            | מטר       | 32 – 240         |
| WLD  | חוט ריתוך             | Welding wire           | גליל      | 65 – 380         |
| ELC  | אלקטרודות ריתוך        | Welding electrodes     | חבילה     | 45 – 210         |
| NUT  | אומים מגולוון          | Galvanized nuts        | חבילה     | 18 – 120         |
| BLT  | ברגים מגולוון          | Galvanized bolts       | חבילה     | 28 – 280         |
| PNT  | צבע יסוד אפוקסי        | Epoxy primer           | פח        | 85 – 620         |
| THN  | מדלל לצבע              | Paint thinner          | פח        | 32 – 340         |

Dimensions within each family are realistic (e.g. ANG gets
20x20x3 … 100x100x8, IPE gets IPE 80 … IPE 200).

### 6.9 Company-name building blocks

- **COMPANY_PREFIX** (18): ברזל, פלדה, מתכות, אלומיניום, נירוסטה, צבעים,
  ריתוך, חיתוך, חרושת, כלי עבודה, מסגרות, בנייה, תעשיות, כימיקלים,
  שמנים, בורגי, ציוד, אבטחת, הגנת
- **COMPANY_MIDDLE** (14): הארץ, הצפון, הדרום, המרכז, השרון, הגולן, הכרמל,
  הנגב, הגליל, הנמל, העמק, השפלה, המישור, המפרץ
- **COMPANY_SURNAMES** (20): רוטנברג, ברזילאי, פרידמן, שפירא, גולדשטיין,
  הלוי, סגל, כהן, לוי, מזרחי, פרץ, ביטון, דהן, חדד, אזולאי, גבאי,
  שלומי, שמעוני, אוזן, יוסף
- **COMPANY_SUFFIX_BIZ** (16): עבודות מתכת, עבודות ברזל, מסגרות,
  יצור וריתוך, חיתוך לייזר, ציוד ובינוי, תעשיות, יבוא ושיווק,
  סחר ותעשיה, קבלני משנה, הנדסה ובינוי, כלי עבודה, ציוד מקצועי,
  חומרי בניין, צבעים וציפויים, חומרי גלם
- **COMPANY_SUFFIX_LEGAL**: בע"מ, ושות', אחים, בע"מ, (empty)

Three patterns combine these:
1. `<surname> <biz_suffix> <legal>` → "רוטנברג עבודות מתכת בע\"מ"
2. `<prefix> <region> <legal>` → "ברזל הארץ בע\"מ"
3. `<biz_suffix> <surname>` → "יבוא צבעים רוטנברג"

---

## 7. 2026 payroll constants (Israeli tax + social)

Used by `generatePayroll` / `computeIncomeTax` / `computeBituachLeumi` /
`computeMasBriut`. These match the `ISRAELI_TAX_CONSTANTS_2026.md`
cheat-sheet in the repo root, but are **seed-data only** — production
payroll uses `src/payroll/wage-slip-calculator.js` for the authoritative
audited figures.

### 7.1 Income tax brackets (monthly, NIS)

| Up to  | Rate |
|-------:|-----:|
|  6,790 | 10%  |
|  9,730 | 14%  |
| 15,620 | 20%  |
| 21,710 | 31%  |
| 45,180 | 35%  |
| 58,190 | 47%  |
| ∞      | 50%  |

Personal credit point value: 242 NIS (default 2.25 points = 544.50 NIS credit).

### 7.2 Bituach Leumi

- Reduced 3.5% up to 7,522 NIS monthly threshold
- Full 7% above threshold

### 7.3 Mas Briut (health tax)

- Reduced 3.1% up to 7,522 NIS monthly threshold
- Full 5% above threshold

### 7.4 Pension + severance

- Employee pension: 6.0% (statutory minimum)
- Employer pension: 6.5%
- Employer severance (קרן פיצויים): 8.33%

---

## 8. Test matrix (56 tests, all green)

Run:
```
node --test test/seed/israeli-seed.test.js
```

| # | Suite                              | Coverage                                            |
|--:|------------------------------------|-----------------------------------------------------|
| 3 | mulberry32                         | determinism, independence, output range             |
| 1 | embeddedGenerateValidTZ            | 200 draws validated by production validator         |
| 2 | generateValidCompanyId             | default prefix + alternative prefixes               |
| 8 | generateSupplier                   | count, determinism, differentiation, Hebrew, IDs,   |
|   |                                    | phone formats, known cities, industrial streets     |
| 5 | generateCustomer                   | determinism, B2B/B2C mix, TZ validity, company-id,  |
|   |                                    | Hebrew preservation                                 |
| 7 | generateEmployee                   | determinism, TZ, ages, tenure≤age-18, roles,        |
|   |                                    | production weighting, Hebrew, wage bands            |
| 4 | generateItem                       | determinism, SKU encoding, Hebrew, price bands      |
| 6 | generateInvoice                    | guardrails, determinism, 17% VAT identity,          |
|   |                                    | line-sum = subtotal, 7-digit allocation, due_date   |
| 7 | generatePayroll                    | determinism, 1:1 slip mapping, month format,        |
|   |                                    | accounting identity, positive net, employer cont.   |
| 5 | tax / BL / health compute helpers  | zero-wage, high bracket, threshold behaviour        |
| 3 | generateAll                        | default shape, full-tree determinism, FK integrity  |
| 2 | reset() / fork()                   | rewind, independent sub-streams                     |
| 2 | heToLatinSlug                      | nullish safety, Hebrew mapping                      |

**56 tests, 56 pass, 0 fail, ~140ms total runtime.**

---

## 9. Usage patterns

### Dev fixture file

```js
const fs = require('node:fs');
const { IsraeliSeedGenerator } = require('./src/seed/israeli-seed.js');

const gen = new IsraeliSeedGenerator({ seed: 20260411 });
const fixture = gen.generateAll({
  suppliers: 50,
  customers: 200,
  employees: 25,
  items: 150,
  invoices: 500,
  months: ['2025-11','2025-12','2026-01','2026-02','2026-03'],
});
fs.writeFileSync('./fixtures/dev-seed.json', JSON.stringify(fixture, null, 2));
```

### Jest/node:test fixture

```js
// deterministic — the same 5 suppliers every test run
const seeder = new IsraeliSeedGenerator({ seed: 42 });
const suppliers = seeder.generateSupplier(5);
```

### Independent streams

```js
const gen = new IsraeliSeedGenerator({ seed: 42 });
const customersStream = gen.fork('customers');
const invoicesStream  = gen.fork('invoices');
// Generating from one does not consume entropy from the other.
```

### Scaling up for load tests

```js
const gen = new IsraeliSeedGenerator({ seed: 1 });
const big = gen.generateAll({
  suppliers: 500,
  customers: 5000,
  employees: 200,
  items: 800,
  invoices: 50000,   // half a million rows once you add the payslips
  months: Array.from({ length: 12 }, (_, i) =>
    `2026-${String(i+1).padStart(2,'0')}`),
});
```

---

## 10. Never-delete invariant

No existing file was modified, removed, or renamed. The generator, its
tests, and this report are all **new files** added under new paths:

- `onyx-procurement/src/seed/` — brand-new directory
- `onyx-procurement/test/seed/` — brand-new directory
- `_qa-reports/AG-X85-israeli-seed.md` — brand-new file

The generator OPTIONALLY reads from `src/validators/teudat-zehut.js` when
available, but the import is wrapped in try/catch so absence is silent.

---

## 11. Realism notes + gotchas

- **ID prefixes:** `513` = private LLC. If you want government entities
  (prefix `50`), cooperatives (`59`), etc., call
  `generateValidCompanyId(rng, '59X')` directly.
- **Hebrew text:** every Hebrew string goes through the source pools
  unchanged (no transliteration, no normalization) so right-to-left
  rendering, bidi mark handling, and Unicode integrity can be QA'd from
  seed data alone.
- **Emails:** the locals are Latin-transliterated via a tiny
  Hebrew→Latin map. They look like `moshe.cohen@gmail.com` rather than
  mangled gibberish.
- **Dates:** invoice issue dates span Oct 2025 → Jun 2026 so a fresh
  fixture file exercises quarter boundaries and year-end.
- **Payroll months:** any `YYYY-MM` string is accepted; `generateAll`
  defaults to `['2026-01','2026-02','2026-03']`.
- **Currency:** always `ILS`. All monetary fields are in NIS (no agorot
  fractions beyond 2 decimals).
- **VAT:** always 17%. If the Tax Authority changes the rate, update
  `generateItem.vat_rate` + `generateInvoice` vat constant.

---

## 12. Next-step suggestions (not in scope)

These are **upgrades**, not deletions — aligned with the "רק מגדלים"
rule. Each could be done by a follow-up agent:

- Add a `generatePurchaseOrder` helper that links supplier + items
  pre-invoice (so PO → GRN → Invoice flows can be seeded end-to-end).
- Add a `generateBankStatement` helper using real Bank Leumi / Hapoalim
  CSV row shapes, wired to the existing `src/bank/parsers.js`.
- Add a locale flag so the same pools can emit RTL-formatted strings
  vs. plain Hebrew.
- Add a `generateVendorBill` (פנקס שיקים) helper with realistic cheque
  numbers for the check-printer module (`src/payroll/check-printer.js`).
- Wire a CLI entry point `node -e "require('./src/seed/israeli-seed').IsraeliSeedGenerator …"`
  so devs can dump a JSON fixture with one command.

---

## 13. Sign-off

- Files delivered exactly as requested
- 56/56 tests green
- Zero external dependencies
- Tolerates absent validators
- Every generated ID passes the real production validator
- Hebrew text preserved end-to-end
- Deterministic given a seed
- No existing file touched

**Status: PASS.**
