# AG-Y016 — Sales Quote Builder / בונה הצעות מחיר

**Agent:** Y-016
**Module:** `onyx-procurement/src/sales/quote-builder.js`
**Tests:** `onyx-procurement/test/sales/quote-builder.test.js`
**Date:** 2026-04-11
**Rule:** לא מוחקים רק משדרגים ומגדלים (never delete, only upgrade and grow)

---

## 1. Purpose

Build, revise, price, and publish bilingual (Hebrew RTL + English) sales quotes
for Techno-Kol Uzi. Supports multi-version history, configurable VAT, optional
multi-currency via `fx-engine`, and a חשבונית רפורמה 2024 allocation-number
placeholder that flows forward into sales orders and eventually invoices.

Zero runtime dependencies beyond the optional `pdfkit` already present in
`onyx-procurement/package.json` and the optional `src/fx/fx-engine.js` sibling
module. If either is missing, the module degrades gracefully (text-fallback PDF,
ILS-only pricing) without throwing.

---

## 2. Quote Lifecycle / מחזור חיי הצעת מחיר

```
                   ┌───────────┐
                   │   draft   │
                   └─────┬─────┘
                         │ sent
                         ▼
                   ┌───────────┐
                   │    sent   │─────────┐
                   └─────┬─────┘         │
                         │ accepted      │ lost / expired
                         ▼               │
                   ┌───────────┐         │
                   │ accepted  │         │
                   └─────┬─────┘         │
                         │ won           │
                         ▼               │
                   ┌───────────┐         │
                   │    won    │         │
                   └───────────┘         │
                                         ▼
                                   terminal: lost, expired
```

**Allowed transitions** (`ALLOWED` constant):

| From     | Allowed Next                     |
|----------|----------------------------------|
| draft    | sent, expired                    |
| sent     | accepted, lost, expired          |
| accepted | won, lost, expired               |
| won      | *(terminal — never transitions)* |
| lost     | *(terminal)*                     |
| expired  | *(terminal)*                     |

Any illegal transition throws a descriptive error listing the legal set. Every
transition appends a record to `quote.history[]` with timestamp, from, to,
actor, reason.

**Editing rule:** lines / discounts can only be mutated while status is
`draft`. Once sent, `reviseQuote(id, changes)` must be used — it creates
version N+1 and forks the quote back to `draft`. Prior versions remain
retrievable via `getVersion(id, v)` and `listVersions(id)` forever.

---

## 3. Field Map / מיפוי שדות

### Quote envelope

| Field                  | Type       | Notes                                                   |
|------------------------|------------|---------------------------------------------------------|
| `id`                   | string     | `Q-<base36 ts>-<rand>` — stable across versions         |
| `number`               | string     | `Q-YYYY-NNNNN` display number                           |
| `version`              | int        | 1-based, monotonic per chain                            |
| `status`               | enum       | draft/sent/accepted/won/lost/expired                    |
| `customer`             | object     | name, company_id, email, phone, address                 |
| `seller`               | object     | snapshot of ctor `sellerInfo`                           |
| `issued_date`          | YYYY-MM-DD | from injected clock                                     |
| `valid_days`           | int        | default 30                                              |
| `expires_date`         | YYYY-MM-DD | `issued_date + valid_days`                              |
| `currency`             | string     | ISO 4217, default from ctor                             |
| `vat_rate`             | number     | snapshot of ctor `vatRate` at creation                  |
| `lines[]`              | array      | see below                                               |
| `discounts[]`          | array      | total-scope discounts, append-only                      |
| `terms`                | string     | free text                                               |
| `notes`                | string     | free text                                               |
| `tags[]`               | array      | free-form labels                                        |
| `allocation_number`    | string/nil | רפורמה 2024 placeholder — null until assigned           |
| `allocation_source`    | enum       | pending / preassigned / assigned                        |
| `history[]`            | array      | append-only audit trail                                 |
| `created_at`           | ISO 8601   | creation timestamp                                      |
| `updated_at`           | ISO 8601   | last-edit timestamp                                     |
| `previous_version_id`  | string/nil | chain pointer                                           |
| `totals`               | object     | cached computeTotals() snapshot                         |

### Line item

| Field        | Type    | Notes                                                  |
|--------------|---------|--------------------------------------------------------|
| `sku`        | string  | required                                               |
| `description`| string  | defaults to sku                                        |
| `qty`        | number  | non-negative                                           |
| `unit`       | string  | default `יח׳`                                          |
| `unitPrice`  | number  | non-negative                                           |
| `discount`   | object  | `{ type:'percent'|'amount', value, reason }`           |
| `tax_code`   | string  | default `VAT_STANDARD`                                 |

### Total-scope discount

| Field    | Type      | Notes                                     |
|----------|-----------|-------------------------------------------|
| `id`     | string    | auto-generated                            |
| `type`   | enum      | percent / amount                          |
| `value`  | number    | percent 0-100 or currency amount          |
| `reason` | string    | optional free text                        |
| `at`     | ISO 8601  | applied timestamp                         |

### Totals object (from `computeTotals`)

```
{
  currency, vat_rate,
  subtotal,          // sum of line gross (qty * unitPrice), pre-discount
  line_breakdown[],  // per-line { sku, qty, unitPrice, gross, discount, net }
  line_discount,     // sum of all line discounts
  total_breakdown[], // per total-scope discount with resolved amount
  total_discount,    // line_discount + sum(total_breakdown.amount)
  pre_vat_net,       // same as net, kept as alias for tax reporting
  net,               // clamped ≥ 0
  vat,               // net * vat_rate
  gross              // net + vat
}
```

Discount order of operations: line discounts → total discounts (in insertion
order) → VAT → gross. Each discount is clamped so the net can never go
negative.

---

## 4. PDF Layout / פריסת ה-PDF

Bilingual A4 page, 40pt margin, uses the same `pdfkit` patterns as
`src/payroll/pdf-generator.js` so both documents share a look and feel.

### Layout blocks (top → bottom)

1. **Title banner** — `Sales Quote / הצעת מחיר` centered, 20pt.
2. **Metadata row** — quote #, version, issue date, valid-until date.
3. **Two-column party block** — Seller (right in RTL / left in LTR) and
   Customer (opposite column) with legal name, company ID, address, contact.
4. **Horizontal rule** — separator.
5. **Line item table** — columns: SKU, Description (bilingual header),
   Qty, Unit price, Line total. Line discount (if any) appears on the row
   below in grey 8pt text.
6. **Horizontal rule**.
7. **Totals block** (right-aligned): subtotal, total discount,
   net, VAT (label includes configured %), gross (bold).
8. **Terms** / `תנאים` paragraph if provided.
9. **Notes** / `הערות` paragraph if provided.
10. **Allocation number block** — either the pre-assigned number or the
    literal placeholder `__________` labeled bilingually.
11. **Reforma 2024 notice** — both HE and EN copy explaining that the tax
    invoice issued on deal close will carry a real allocation number from
    רשות המיסים.
12. **Status footer** — centered, 8pt grey, bilingual status label.

### Fallback when pdfkit missing

`generatePDF()` degrades to a plain-text payload (`engine:'text'`) with the
same block ordering so automated pipelines never break. Text output contains
all Hebrew and English labels and is valid UTF-8.

---

## 5. חשבונית רפורמה 2024 — Allocation Number Handling

Per the Israeli 2024 Invoice Reform, every tax invoice above the phased
threshold must bear a `allocation_number` obtained from רשות המיסים. Quotes
do **not** need one, but the field is carried on the quote so:

1. **At creation** — caller may pass `allocationNumber` (e.g. bulk-requested
   for a strategic customer). Default is `null` with `allocation_source:
   'pending'`.
2. **On PDF** — printed as placeholder `__________` with bilingual hint, plus
   the reforma notice explaining the follow-up.
3. **On `convertToOrder`** — the placeholder (or assigned number) propagates
   unchanged so the order + invoice stages can fill it in later without
   rewriting history.
4. **On `reviseQuote`** — `changes.allocationNumber` accepted; setting flips
   `allocation_source` to `'assigned'`.

This keeps the quote builder compliant with the reform without hard-wiring
it to a specific authority API.

---

## 6. Pricing Engine Walk-through

Example — the test fixture:

```
line 1: SKU-100 × 2 @ 1500  → gross 3000,  no discount   → net 3000
line 2: SKU-200 × 10 @ 45   → gross 450,  10% line disc  → net  405
line 3: SKU-300 × 50 @ 12   → gross 600,  no discount   → net  600
-----------------------------------------------------------------
subtotal          = 3000 + 450 + 600 = 4050
line_discount     =                      45
pre_total_net     = 4050 - 45         = 4005
total_discount    =                       0
net               =                    4005
VAT (17%)         = 4005 × 0.17       =  680.85
gross             = 4005 + 680.85     = 4685.85
```

All values use banker's rounding to 2 decimal places (same routine as
`fx-engine.js` to prevent drift between modules).

---

## 7. Versioning / גרסאות

* `createQuote` → v1 in `draft`.
* `addLine` / `removeLine` / `updateLine` / `applyDiscount` are only allowed
  while status is `draft`. They mutate the current head in place and refresh
  `totals`.
* `reviseQuote(id, changes)` clones the head, bumps `version`, sets
  `previous_version_id`, patches the requested fields, re-runs `computeTotals`,
  appends to `history`, and pushes onto the chain. If the old head was `sent`,
  the new version resets to `draft` so it can be edited before re-sending.
* `listVersions(id)` and `getVersion(id, v)` provide read access to the
  whole chain. `getVersion(id)` with no version returns the head.
* `all()` returns every chain head — handy for a simple list view without
  a database.

Storage is an in-memory `Map<id, Version[]>`, designed to be swapped for
Supabase/PG by the caller. All operations are synchronous except `generatePDF`
which returns a Promise.

---

## 8. Hebrew Glossary / מילון עברית-אנגלית

| HE                    | EN              | Used in                             |
|-----------------------|-----------------|-------------------------------------|
| הצעת מחיר            | Sales Quote     | Title, PDF header                   |
| מס' הצעה             | Quote #         | Metadata row                        |
| גרסה                 | Version         | Metadata row                        |
| לקוח                 | Customer        | Party block                         |
| ספק                  | Seller          | Party block                         |
| תאריך                | Date            | Metadata                            |
| בתוקף עד             | Valid until     | Metadata                            |
| מק"ט                 | SKU             | Line table                          |
| תיאור                | Description     | Line table                          |
| כמות                 | Qty             | Line table                          |
| מחיר ליחידה         | Unit price      | Line table                          |
| הנחה                 | Discount        | Line + totals                       |
| סה"כ שורה            | Line total      | Line table                          |
| סכום ביניים         | Subtotal        | Totals block                        |
| סה"כ הנחה            | Total discount  | Totals block                        |
| נטו לפני מע"מ        | Net             | Totals block                        |
| מע"מ                 | VAT             | Totals block                        |
| סה"כ לתשלום          | Gross total     | Totals block                        |
| תנאים                | Terms           | Footer section                      |
| הערות                | Notes           | Footer section                      |
| סטטוס                | Status          | Status footer                       |
| טיוטה                | Draft           | Status label                        |
| נשלח                 | Sent            | Status label                        |
| אושר                 | Accepted        | Status label                        |
| נסגר                 | Won             | Status label                        |
| לא נסגר              | Lost            | Status label                        |
| פג תוקף              | Expired         | Status label                        |
| מס' הקצאה           | Allocation #    | Reforma 2024 block                  |
| רפורמת החשבונית 2024| 2024 invoice reform | Reforma 2024 notice            |
| יח׳                  | unit            | Default line unit                   |

The glossary is exported as `GLOSSARY` so other modules (invoices, orders,
dashboards) can reuse the exact same labels without drifting translations.

---

## 9. Test Coverage

`test/sales/quote-builder.test.js` — **44 tests, all passing**:

```
✔ ctor: default VAT 17%, default currency ILS
✔ ctor: VAT rate is configurable
✔ ctor: injected clock is used for createQuote
✔ createQuote: draft status, version 1, customer snapshot
✔ createQuote: rejects bad inputs
✔ createQuote: allocation_number starts as placeholder "pending"
✔ createQuote: allocation_number can be preassigned
✔ computeTotals: plain math, no discounts, 17% VAT
✔ computeTotals: fixture quote (10% line discount)
✔ computeTotals: honors config vatRate (18%)
✔ computeTotals: line discount as amount
✔ computeTotals: discount cannot exceed gross (clamped)
✔ computeTotals: net never negative
✔ applyDiscount: scope=total, percent
✔ applyDiscount: scope=total, amount
✔ applyDiscount: scope=line, mutates line.discount
✔ applyDiscount: accumulates, does not replace
✔ applyDiscount: rejects percent > 100
✔ applyDiscount: scope=line requires sku
✔ addLine: appends new sku
✔ addLine: dup sku merges qty
✔ updateLine: qty change reflows totals
✔ removeLine: drops sku
✔ addLine: not allowed on sent quote
✔ reviseQuote: creates v2 with patched terms; v1 preserved
✔ reviseQuote: v1 history is fully preserved (never deleted)
✔ reviseQuote: replace lines patch
✔ reviseQuote: listVersions returns all; getVersion by number
✔ reviseQuote: throws for unknown id
✔ statusTransition: draft → sent → accepted → won happy path
✔ statusTransition: accepted → lost is legal
✔ statusTransition: illegal draft → won
✔ statusTransition: illegal draft → accepted
✔ statusTransition: terminal states cannot move
✔ statusTransition: any → expired is legal before terminal
✔ convertToOrder: requires accepted or won
✔ convertToOrder: preserves totals, lines, customer, allocation placeholder
✔ glossary: all status labels bilingual
✔ glossary: reforma 2024 notice bilingual
✔ generatePDF: produces PDF or bilingual text fallback
✔ statusTransition: throws for unknown id
✔ convertCurrency: uses injected fxEngine
✔ convertCurrency: throws without fxEngine
✔ never-delete rule: chain grows monotonically
```

Run: `node --test test/sales/quote-builder.test.js` from `onyx-procurement/`.

---

## 10. Integration Points

| Consumer                     | How to wire                                          |
|------------------------------|------------------------------------------------------|
| CRM / opportunity module     | `new QuoteBuilder({ sellerInfo: orgProfile })`       |
| Orders pipeline              | `builder.convertToOrder(quote)` → upstream fulfill  |
| Invoices (רפורמה 2024)       | Read `allocation_number` off the order              |
| Multi-currency reports       | `builder.convertCurrency(quote, 'USD', date)`       |
| PDF archival                 | `generatePDF(quote, path)` → returns `{path,size}`  |
| VAT config                   | Inject `vatRate` from single source of truth        |

---

## 11. Non-goals (intentional)

* No DB persistence — in-memory only, caller owns storage.
* No email/SMS delivery — status moves to `sent` as a data change; the
  wire layer is a separate agent.
* No commission calculation — that belongs to HR/sales-ops modules.
* No tax exemption certificates — assumed handled upstream via `tax_code`.

---

## 12. Never-delete guarantee

The module treats the quote chain as append-only:

* No method deletes a version. `reviseQuote` always pushes a new entry.
* `quote.history[]` is append-only; every status change and revision is
  preserved with actor and reason.
* `quote.discounts[]` is append-only; applying a new total discount does
  not overwrite previous ones — it stacks on top so audit trails survive.
* The in-memory `_quotes` Map has no public delete path.

This satisfies the project rule **לא מוחקים רק משדרגים ומגדלים**.

---

## 13. Files touched / added

* `onyx-procurement/src/sales/quote-builder.js` — new module (~880 LOC)
* `onyx-procurement/test/sales/quote-builder.test.js` — new tests (44 cases)
* `_qa-reports/AG-Y016-quote-builder.md` — this report

No existing files were modified or deleted.
