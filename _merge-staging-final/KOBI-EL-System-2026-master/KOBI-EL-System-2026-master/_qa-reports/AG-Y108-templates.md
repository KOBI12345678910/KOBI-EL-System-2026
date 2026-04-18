# AG-Y108 — Document Templates Manager

**Agent:** Y108
**Component:** `onyx-procurement/src/documents/templates.js`
**Tests:** `onyx-procurement/test/documents/templates.test.js`
**Status:** 73 / 73 passing (`node --test`)
**Rule:** לא מוחקים רק משדרגים ומגדלים (never delete — only version up and grow).
**Dependencies:** zero — pure JavaScript, Node standard library only.

---

## 1. Purpose

A zero-dependency mini-handlebars template engine plus a template
registry for the Mega-ERP. It handles every document the ERP
produces — invoices, receipts, purchase orders, contracts, HR
letters — in Hebrew and English, with variable substitution,
conditional sections, loops over line items, helper functions
(currency, dates, numbers), bilingual side-by-side rendering,
format conversion stubs (html / pdf / docx / txt / md), version
history, partial dependencies, and a lightweight approval workflow
for legal-sensitive templates.

The implementation follows the *never delete* rule: a template
update creates a new version and snapshots the prior one into
history. Templates can be superseded but never erased.

---

## 2. Public API

```js
const { DocumentTemplates } = require('./src/documents/templates');

const dt = new DocumentTemplates({ seed: true }); // seeds 11 built-ins

// Register / update
dt.registerTemplate({
  id: 'invoice',
  name_he: 'חשבונית מס',
  name_en: 'Tax Invoice',
  category: 'financial',
  language: 'bilingual',
  content: { he: '...', en: '...' },
  variables: [
    { name: 'invoice_number', type: 'string', required: true },
    { name: 'vat_rate', type: 'number', required: true, default: 18 },
    ...
  ],
  sections: [
    { id: 'header', conditional: null },
    { id: 'notes', conditional: 'notes' },
  ],
});

// Render
dt.render({ templateId, context, lang, escape });
dt.renderBilingual({ templateId, context, separator });
dt.renderFormats({ templateId, context, format, lang }); // txt|md|html|pdf|docx

// Check
dt.validate({ templateId, context });   // { valid, missing, warnings }
dt.testTemplate(templateId, fixtures);  // CI smoke test

// Governance
dt.versionTemplate(templateId);          // version history
dt.dependencies(templateId);             // who uses this as a partial
dt.approvalWorkflow({ templateId, action, approvers, reviewer, decision });
dt.languageFallback(templateId, lang);

// Extensibility
dt.registerPartial(name, source);
dt.registerHelper(name, fn);
dt.listHelpers();
dt.listTemplates();
dt.getTemplate(templateId);
```

---

## 3. Syntax Reference

### 3.1 Variable substitution

| Syntax | Meaning |
|---|---|
| `{{name}}` | Look up `name` in the current scope; parent scopes walked up. |
| `{{user.address.city}}` | Dot-path lookup into nested objects. |
| `{{{html}}}` | Triple brace — raw, not HTML-escaped. |
| `{{this}}` / `{{.}}` | Current item (inside `{{#each}}`). |
| `{{@index}}` | 0-based iteration index. |
| `{{@first}}` / `{{@last}}` | Booleans for first/last in `{{#each}}`. |
| `{{@count}}` | Total item count in the current `{{#each}}`. |

### 3.2 Block helpers

| Syntax | Meaning |
|---|---|
| `{{#if cond}}...{{/if}}` | Truthy branch. Arrays are truthy only when non-empty; objects only when non-empty. |
| `{{#if cond}}...{{else}}...{{/if}}` | With else branch. |
| `{{#unless cond}}...{{/unless}}` | Inverse conditional. |
| `{{#each items}}...{{/each}}` | Iterate over an array. Inside the block, object keys of each item are spread into scope. |
| `{{> partialName}}` | Include a previously-registered partial. |
| `{{! comment }}` | Stripped at compile time. |

### 3.3 Inline helpers

Helpers are called as the first token inside `{{...}}`, with
space-separated arguments. Arguments can be paths, quoted strings,
numbers, `true`/`false`, or `null`.

```
{{formatCurrency total_amount "ILS"}}
{{formatDate issue_date "dd/mm/yyyy"}}
{{#if eq status "paid"}}PAID{{/if}}
{{default notes "N/A"}}
```

### 3.4 Escaping

- `render({..., escape: true})` HTML-escapes all `{{var}}` output.
- `{{{var}}}` bypasses escaping regardless of the flag.
- `renderFormats({..., format: 'html'})` always escapes interpolated values.
- All other formats (`txt`, `md`, `pdf`, `docx`) pass values through unescaped.

---

## 4. Built-in helpers

| Helper | Signature | Example |
|---|---|---|
| `formatCurrency` | `(amount, currency?)` | `₪1,234.50` (ILS / USD / EUR / other) |
| `formatDate` | `(date, format?)` | `dd/mm/yyyy` default; also `yyyy-mm-dd`, `dd.mm.yy`, `HH:MM` |
| `formatNumber` | `(number, decimals?)` | `1,234.57` |
| `upper`, `uppercase` | `(str)` | uppercase conversion |
| `lower`, `lowercase` | `(str)` | lowercase conversion |
| `trim` | `(str)` | strip whitespace |
| `length` | `(collection)` | array length / object keys / string length |
| `eq`, `neq` | `(a, b)` | strict equality |
| `gt`, `lt`, `gte`, `lte` | `(a, b)` | numeric comparison |
| `and`, `or` | `(a, b)` | boolean combine |
| `not` | `(a)` | boolean negate |
| `default` | `(value, fallback)` | fallback if null / undefined / empty string |
| `concat` | `(...args)` | string concatenation |
| `t` | `(key)` | i18n key lookup placeholder (override via `options.helpers`) |

Custom helpers are registered at runtime via `dt.registerHelper(name, fn)`.

---

## 5. Seed templates (11 bilingual)

| ID | Hebrew | English | Category | Key variables |
|---|---|---|---|---|
| `lease_agreement` | הסכם שכירות | Lease Agreement | legal | landlord, tenant, property, lease_start, lease_end, monthly_rent, deposit, includes_utilities, pet_allowed |
| `invoice` | חשבונית מס | Tax Invoice | financial | invoice_number, supplier, customer, items, subtotal, vat_rate (default 18), vat_amount, total_amount |
| `quote` | הצעת מחיר | Price Quote | sales | quote_number, valid_until, customer, items, subtotal, vat_amount, total_amount, terms |
| `purchase_order` | הזמנת רכש | Purchase Order | procurement | po_number, supplier, buyer, items, total_amount, delivery_date, delivery_address, special_instructions |
| `offer_letter` | מכתב הצעת עבודה | Offer Letter | hr | candidate, position, start_date, salary, work_hours (default 42), has_equity, equity_shares, has_bonus, max_bonus, offer_valid_until, hiring_manager |
| `termination_letter` | מכתב סיום העסקה | Termination Letter | hr | employee, termination_date, severance, notice_period (default 30), vacation_payout, reason, hr_manager |
| `nda` | הסכם סודיות | Non-Disclosure Agreement | legal | disclosing_party, receiving_party, effective_date, term_years (default 3), purpose, includes_non_compete, non_compete_months |
| `msa` | הסכם מסגרת לשירותים | Master Services Agreement | legal | client, vendor, effective_date, payment_terms (default Net 30), term_years (default 2), has_sla, sla_description |
| `sow` | הצהרת עבודה | Statement of Work | legal | sow_number, msa_reference, client, vendor, project, milestones, total_cost, start_date, end_date |
| `credit_memo` | חשבונית זיכוי | Credit Memo | financial | credit_memo_number, original_invoice_number, supplier, customer, reason, items, subtotal, vat_amount, total_amount |
| `receipt` | קבלה | Receipt | financial | receipt_number, customer, description, payment_method, reference_number, amount, company |

Templates in categories `legal` and `hr` are flagged
`legal_sensitive: true` — their changes are intended to flow through
the approval workflow.

VAT default is **18%** — matches Israeli VAT rate as of 2026.

---

## 6. Hebrew glossary (document vocabulary)

| Hebrew | English | Used in |
|---|---|---|
| חשבונית מס | tax invoice | invoice |
| חשבונית זיכוי | credit memo | credit_memo |
| קבלה | receipt | receipt |
| הצעת מחיר | price quote | quote |
| הזמנת רכש | purchase order | purchase_order |
| הסכם שכירות | lease agreement | lease_agreement |
| הסכם סודיות | NDA | nda |
| הסכם מסגרת לשירותים | master services agreement | msa |
| הצהרת עבודה | statement of work | sow |
| מכתב הצעת עבודה | offer letter | offer_letter |
| מכתב סיום העסקה | termination letter | termination_letter |
| ספק | supplier / vendor | invoice, PO, credit_memo |
| לקוח | customer / client | invoice, quote, receipt, credit_memo |
| משכיר | landlord | lease_agreement |
| שוכר | tenant | lease_agreement |
| מעביד | employer | offer_letter, termination_letter |
| עובד | employee | offer_letter, termination_letter |
| מועמד | candidate | offer_letter |
| ח.פ. | company number (Israel) | all financial / legal |
| ת.ז. | national ID number (Israel) | lease, NDA |
| מע"מ | VAT | invoice, quote, credit_memo |
| סה"כ | total | invoice, quote, PO, credit_memo |
| סכום ביניים | subtotal | invoice, quote, credit_memo |
| דמי שכירות | rent | lease_agreement |
| ערבויות | security deposit | lease_agreement |
| פיצויי פיטורין | severance pay | termination_letter |
| הודעה מוקדמת | notice period | termination_letter |
| פדיון חופשה | vacation payout | termination_letter |
| אבני דרך | milestones | sow |
| תאריך אספקה | delivery date | purchase_order |
| אסמכתא | reference number | receipt |
| תקופת תוקף | term / validity | NDA, MSA |

---

## 7. Versioning semantics

1. Calling `registerTemplate` with an id that already exists **never
   overwrites** the prior record. Instead:
   - The prior template is deep-cloned into `_versions[id]` with the
     note `'superseded'`.
   - The new template becomes the current record with `version =
     prior.version + 1`.
2. `versionTemplate(id)` returns `{ current, history, total_versions }`.
   History is append-only.
3. There is no `deleteTemplate` method — by design.

## 8. Approval workflow

For `category: 'legal'` and `category: 'hr'`, the
`approvalWorkflow({action: 'propose', approvers: [...]})` call opens
a pending review round. Each `approvers` entry must call
`action: 'review'` with `decision: 'approve' | 'reject'`. The first
rejection flips the status to `rejected`; otherwise the round
closes `approved` when every required approver has signed.

The workflow is **gate-level only** — it records the sign-off state
but does not itself block rendering. Calling sites can inspect
`approvalWorkflow({templateId})` before accepting a render request
in production.

## 9. Format conversion

| Format | Behavior |
|---|---|
| `txt` | Plain render, `text/plain` MIME. |
| `md` | Prepends `# <template name>` heading, `text/markdown` MIME. |
| `html` | Full `<!doctype html>` wrapper with `lang`/`dir` for Hebrew (`rtl`) / English (`ltr`). Each non-empty line is wrapped in `<p>`; empty lines become `<br/>`. All interpolated values are HTML-escaped. |
| `pdf` | Returns `{ format, content, mime, pdf_spec }` where `pdf_spec` describes title, language, direction, page size, and body — intended to be consumed by a downstream PDF writer. |
| `docx` | Returns `{ format, content, mime, docx_spec }` with paragraphs split on newlines, language, and direction. |

Keeping pdf / docx as spec objects preserves the zero-dependency
contract while still letting the rest of the system produce real
binary files in those formats.

## 10. Test coverage (73 tests)

- **Tokenizer** — 7 tests: plain text, variable, raw, block open/close, else, comments, unterminated input.
- **Variable substitution** — 6 tests: simple, missing, dot-path, escape on/off, raw.
- **Conditionals** — 5 tests: if truthy/falsy, if/else, unless, nested, empty-array truthiness.
- **Loops** — 5 tests: primitives, objects with field access, @-metadata, empty, parent-scope lookup.
- **Helpers** — 10 tests: formatCurrency, formatDate, formatNumber, case helpers, comparisons, custom helpers, default.
- **Validation** — 5 tests: missing, all present, defaulted, type warnings, render throws.
- **Bilingual** — 2 tests: side-by-side output and custom separator.
- **Language fallback** — 3 tests: he→en, en→he, exact match.
- **Versioning** — 3 tests: v1 no history, v3 with snapshots, old content preserved.
- **Partials / dependencies** — 2 tests: include and reverse-lookup.
- **testTemplate** — 4 tests: pass, fail, expect_not_contains, expect_valid:false.
- **Format conversion** — 6 tests: txt, md, html rtl+escape, pdf spec, docx paragraphs, unknown format throws.
- **Approval workflow** — 5 tests: propose, all-approve, single-reject, duplicate review, non-approver blocked.
- **Seed templates** — 6 tests: count, export, invoice bilingual render, receipt conditional, sow loop, lease flags.
- **Low-level utils** — 4 tests: htmlEscape special chars, null/undefined, resolvePath nested, compile AST.

Run: `node --test test/documents/templates.test.js`

```
ℹ tests 73
ℹ pass 73
ℹ fail 0
```

## 11. Design notes

- **Tokenizer walks character-by-character.** We deliberately avoid
  regex for the outer scanner to eliminate catastrophic backtracking
  on large templates and to keep error positions precise.
- **AST cached on registration.** `_compile` runs inside
  `registerTemplate`, so syntax errors surface immediately instead
  of at render time.
- **Parent-scope chain for `{{#each}}`.** Inner items can still
  reference outer context fields (e.g., company name on every line
  item), which matches Handlebars semantics.
- **No eval, no Function.** Expressions are parsed into token
  streams and dispatched by name into the helpers table — there is
  no dynamic code execution anywhere in the render path.
- **Partials are late-bound.** They compile on first use and are
  cached, so adding a partial after templates are registered still
  works.
- **Never delete rule enforced at the data layer.** There is no
  code path that removes a template from `_templates` or from the
  versions list.
- **Hebrew-first fallback.** When a language is missing, the
  fallback walk is `he → en → any other`, consistent with the
  Mega-ERP's primary Hebrew audience.

## 12. Future growth (not deleting anything)

- Wire the i18n `t()` helper into `locales/` for user-visible
  strings embedded in templates.
- Add `{{#with obj}}...{{/with}}` block helper for scoped paths.
- Promote `pdf_spec` / `docx_spec` consumers in
  `src/printing/` — existing thermal / ZPL printers already use
  similar spec-object hand-off.
- Connect `approvalWorkflow` to the audit trail in
  `src/security/audit-trail.js` so approvals appear in the
  tamper-evident log.
- Add `renderFormats` cache keyed by `(templateId, version, context-hash, format)` for high-volume docs.

---

**Agent Y108 — signed off.** לא מוחקים רק משדרגים ומגדלים.
