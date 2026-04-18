# Onyx Procurement — Translation Guide

**Version:** 1.0.0
**Last Updated:** 2026-04-11
**Author:** Agent 82
**Scope:** Consistent bilingual (Hebrew ↔ English) translation standards for all user-facing text in Onyx Procurement.

---

## 1. Philosophy

Onyx Procurement is a Hebrew-first financial system operating under Israeli tax, labor, and commercial law. Hebrew is the **source of truth**. English translations exist for three audiences:

1. Multinational users and auditors (English as business lingua franca)
2. Developers, QA, and integrators (English as engineering default)
3. Compliance reviewers from non-Israeli jurisdictions

The goal is **precision over literal fidelity**. A translation is good when a bilingual accountant reads both versions and cannot find a difference in meaning.

---

## 2. Files & Responsibilities

| File | Purpose | Owner |
|------|---------|-------|
| `locales/terminology.json` | Central glossary — 300+ bilingual business terms | Product + Legal |
| `locales/error-messages.json` | 168 error message codes | Engineering + UX |
| `locales/validation-messages.json` | 68 form validation strings | Engineering |
| `locales/action-labels.json` | 124 button and verb labels | UX |
| `locales/status-labels.json` | 78 entity status labels | UX |
| `locales/helpful-tooltips.json` | 42 explanatory tooltips | Product + Domain Expert |

**Rule of hierarchy:** if a term exists in `terminology.json`, all other files MUST use the same canonical translation. Tooltips may expand, but must not contradict.

---

## 3. Homonym Disambiguation

Hebrew business vocabulary is smaller than English accounting vocabulary, and the same Hebrew word can map to multiple English terms based on context. Always consult `ctx` fields before translating a term.

### 3.1 Critical Homonyms

| Hebrew | Context A | Context B |
|--------|-----------|-----------|
| **מקדמות** | `advance payment` (supplier prepayment) | `advance tax` (income tax prepayment) |
| **הזמנה** | `order` (customer sales order) | `purchase order` (procurement) |
| **חשבונית** | `invoice` (sales) | `bill` (AP supplier invoice) |
| **קבלה** | `receipt` (payment proof) | `goods receipt` (GRN) |
| **התאמה** | `reconciliation` (bank) | `match` (invoice matching) |
| **סגירה** | `closing` (accounting period) | `close` (status transition) |
| **בדיקה** | `review` (approval) | `inspection` (QC) |
| **שומה** | `assessment` (tax) | `appraisal` (real estate) |
| **ריבית** | `interest` (on loans) | `interest` (on deposits) — use `debit/credit interest` |
| **פרעון** | `repayment` (loan) | `maturity` (bond) |
| **עמלה** | `fee` (bank) | `commission` (sales) |

### 3.2 Resolving Ambiguity

1. **Check the domain first.** `מקדמות` in a procurement screen → `Advance Payment`. The same word in a tax report → `Advance Tax`.
2. **Use a full phrase when terse is ambiguous.** Prefer `Supplier Advance Payment` over bare `Advance` when mixing with tax domain.
3. **Attach context in code.** Every key in `terminology.json` has a `ctx` field — use it. Do not translate by the key alone.

---

## 4. Hebrew Style Rules

### 4.1 Gender and Address

- **Second-person default:** masculine singular ("שלח", "צור"). Avoid "שלחי/צרי" — modern Israeli business UX uses masculine as gender-neutral.
- **No honorifics:** Do not write "כבודו" or "מר/גב'" in system text. Use direct verbs.
- **No gerunds for buttons:** `שלח` (send), not `שליחה` (sending). Gerunds are acceptable for states and section headers.

### 4.2 Technical Abbreviations

- Use Hebrew acronyms when they are standard in Israeli business: **מע"מ** (VAT), **ח.פ.** (company number), **ע.מ.** (osek murshe number), **ח-ן** (account), **ב\"ל** (Bituach Leumi).
- Retain Latin abbreviations that are more recognized in Latin: **PCN 836**, **MASAV**, **SWIFT**, **IBAN**, **SOX**, **GDPR**, **KYC**, **AML**.
- Never translate form numbers: **טופס 101**, **טופס 106**, **טופס 161**, **טופס 6111**.

### 4.3 Punctuation and Quotes

- Hebrew quotes: `"` (straight) for code, `״` (gershayim) for hand-typed docs.
- Dates: Israeli format `dd/mm/yyyy` for UI display, **ISO-8601** (`yyyy-mm-dd`) for keys and storage.
- Numbers: thousand separator `,` and decimal `.` (e.g., `1,234.56`).
- Currency: `₪` prefix OR `NIS` postfix — consistent within a screen.
- Percentages: `18%` (no space).

### 4.4 Sentence Ends

- Error messages and toasts: terminal period required.
- Button labels: no period.
- Form field labels: no period; trailing colon optional but recommended for input forms.

---

## 5. English Style Rules

### 5.1 Title Case vs. Sentence Case

- **Button labels**: Title Case — "Save Draft", "Create Purchase Order".
- **Form field labels**: Title Case — "First Name", "VAT Rate".
- **Menu items**: Title Case.
- **Error messages**: Sentence case — "Invoice number is required."
- **Tooltip bodies**: Sentence case, full sentences.

### 5.2 Financial English (Israeli context)

- Prefer **"invoice"** for Hebrew חשבונית (not "bill").
- Prefer **"purchase order"** over "order" to disambiguate.
- Prefer **"National Insurance"** or **"NI"** over "Social Security" for ביטוח לאומי (and explain "Bituach Leumi" once in tooltips for UX).
- Prefer **"Israel Tax Authority"** or **"ITA"** over "IRS" for רשות המיסים.
- Prefer **"payslip"** (UK) over "paystub" (US) — the Israeli term `תלוש שכר` is customarily translated as payslip.
- **"Reconciliation"** is standard for התאמת בנק — do not use "matching".
- Use **"VAT"** not "sales tax". Israeli VAT is a VAT.

### 5.3 Form Number Transliteration

Form numbers stay numeric. Do NOT translate "טופס" → "Document 106" — use **Form 106**. Similarly: Form 101, Form 102, Form 126, Form 161, Form 856, Form 857, Form 1301, Form 1320, Form 6111, PCN 836, PCN 874.

### 5.4 Hebrew Proper Nouns in English

Preserve Hebrew proper nouns transliterated where no English equivalent is standard:

- **Bituach Leumi** — but add parenthetical "(National Insurance)" on first occurrence in longer prose.
- **Keren Hishtalmut** — add "(Study Fund / Professional Development Fund)" on first occurrence.
- **Pitzuim / Pitzuei Piturim** — use "Severance Pay".
- **Osek Murshe / Osek Patur** — use "VAT-Registered Dealer" / "Exempt Dealer", but Hebrew phrase acceptable in tooltips.
- **Hashavshevet** — software name, do not translate.
- **MASAV (מס"ב)** — use MASAV everywhere, as this is the canonical form.
- **Zahav (זה"ב)** — use "Zahav" or "BoI RTGS".

---

## 6. Interpolation Placeholders

All dynamic values use `{param}` syntax (mustache-style, no spaces). Examples:

```json
{
  "he": "חרגת ממגבלת ההעברות. סכום: {amount}, מגבלה: {limit}.",
  "en": "Transfer limit exceeded. Amount: {amount}, limit: {limit}."
}
```

Translators MUST preserve placeholder names. Never translate `{amount}` → `{סכום}`. Never change `{0}` ↔ `{amount}` even if it appears to match position.

**RTL placeholder gotcha:** Hebrew is right-to-left but numbers and `{}` are LTR. The renderer (React, Vue, etc.) handles BiDi automatically — do NOT manually add Unicode directional marks. If a placeholder appears at the start of a Hebrew sentence, that is correct RTL behavior.

---

## 7. Date, Number, and Currency Formatting

Formatting is handled at the **renderer level**, not inside locale strings. Locale files contain literal text only. Use the app's i18n library (e.g., `Intl.NumberFormat`, `date-fns-tz`) to format:

- Money: `en-IL`, currency `ILS`, 2 decimals (standard), 0 decimals (display-compact).
- Dates: `he-IL` → `dd/MM/yyyy`; `en-IL` → `dd MMM yyyy`.
- Times: 24-hour in both locales.
- Timezone: store UTC, display Asia/Jerusalem (both `IST` and `IDT` seasons).

Do NOT embed formatted numbers in the catalog strings. Use placeholders:

```json
// CORRECT
{ "en": "Balance: {amount}", "he": "יתרה: {amount}" }

// WRONG
{ "en": "Balance: 1,234.56 NIS", "he": "יתרה: 1,234.56 ש״ח" }
```

---

## 8. Pluralization

Hebrew has dual forms and complex plurals. Use a pluralization library (ICU MessageFormat, i18next plurals). Never concatenate strings at code level.

```json
{
  "items_selected": {
    "he": {
      "zero": "לא נבחרו פריטים",
      "one": "פריט אחד נבחר",
      "two": "שני פריטים נבחרו",
      "other": "{count} פריטים נבחרו"
    },
    "en": {
      "zero": "No items selected",
      "one": "1 item selected",
      "other": "{count} items selected"
    }
  }
}
```

---

## 9. Tone and Voice

| Context | Hebrew Tone | English Tone |
|---------|-------------|--------------|
| Success toast | "נשמר בהצלחה" | "Saved successfully" |
| Error toast | "שמירה נכשלה. נסה שוב." | "Save failed. Please try again." |
| Destructive confirm | "פעולה זו אינה הפיכה. להמשיך?" | "This action cannot be undone. Continue?" |
| Onboarding | "בוא נתחיל" | "Let's begin" |
| Empty state | "אין עדיין נתונים להצגה" | "No data to display yet" |
| Tooltip | Factual, teaching voice | Factual, teaching voice |

Avoid jokes, slang, exclamation marks (except for celebratory milestones), and emoji — this is a financial system used by auditors.

---

## 10. Review Workflow

Any change to locale files MUST pass through:

1. **Terminology check** — does the new term match `terminology.json`? If new, add to terminology first.
2. **Domain review** — a domain expert (payroll/VAT/bank/tax/procurement/compliance) signs off.
3. **Linguistic review** — Hebrew copywriter validates style; English editor validates tone.
4. **Code review** — engineer validates interpolation, encoding, JSON schema.
5. **QA smoke test** — render each changed string in both RTL and LTR, check for truncation and alignment bugs.

---

## 11. Common Mistakes (Do Not Repeat)

1. **Translating form numbers.** `טופס 106` is always "Form 106", never "Document 106".
2. **Translating `מקדמות` as "Advances" without context.** Always disambiguate: "Advance Payment" (to supplier) vs. "Tax Advance" (to ITA).
3. **Using "Tax ID" for ח.פ.** The correct English term is **Business Number** or **Company Registration Number**. "Tax ID" is ambiguous.
4. **Mixing "vendor" and "supplier"** in the same screen. Pick one per screen (both are acceptable translations of ספק).
5. **Translating `שומה` as "assessment" everywhere.** In real estate it's "appraisal" (`שומת נכס`).
6. **Writing "17% VAT" in legacy screens.** Israel VAT is **18%** from Jan 1, 2025. Do not hardcode rates.
7. **Using `draft` for both טיוטה and סקיצה.** Use "Draft" for טיוטה (work-in-progress) and "Sketch" for סקיצה (informal/non-official).
8. **Using "check" and "cheque" inconsistently.** Pick one per product. Onyx standard: **"check"** (US spelling).
9. **Using "payroll period" and "pay period" interchangeably in code.** Onyx standard: **pay period** in code, "payroll period" is acceptable in UX where clarity is needed.
10. **Forgetting the "reform" of 2024–2025.** Allocation numbers are required from 2024 — any legacy text about invoicing must be updated.

---

## 12. Glossary Extension Process

To add a new term to `terminology.json`:

1. Check if it already exists under a different key.
2. Choose a **stable snake_case key** (e.g., `payroll.ytd_gross`).
3. Write the Hebrew (authoritative), English, and a `ctx` field explaining the context.
4. If the term is ambiguous (homonym), add `ctx` for all possible senses and use different keys.
5. Run `npm run lint:locales` (if available) to verify JSON validity.
6. Submit PR with examples showing where the term will be used.

---

## 13. Immutability Rule (System-Wide)

**Once a terminology key is published, its Hebrew and English values must not change** — only **extended** or **deprecated**. Changing a canonical term silently breaks downstream data (reports, audit logs, historical screenshots). If a term must evolve:

1. Add a **new key** with the new term.
2. Mark the old key deprecated in a `deprecated: true` field.
3. Provide a migration note in commit history.
4. Old key remains for audit trail back-compat — **do not delete**.

---

## 14. Domain Expert Contacts

| Domain | Expert Role | Review Cadence |
|--------|------------|----------------|
| Payroll | Payroll specialist / bookkeeper | On change |
| VAT | Senior accountant | Quarterly |
| Bank | Treasurer / AP lead | On change |
| Annual Tax | CPA | Annually (post-reform) |
| Procurement | CPO / Procurement lead | On change |
| Compliance | DPO / Compliance officer | Semi-annually |

---

## 15. Versioning

Locale files use **semver** at the file level (`meta.version`). Bump rules:

- **Patch (x.y.Z)**: typo fixes, context improvements, non-breaking additions.
- **Minor (x.Y.z)**: new keys, new languages, non-breaking extensions.
- **Major (X.y.z)**: breaking changes (key rename, meaning change) — **must be accompanied by a migration plan**.

Record all changes in a `CHANGELOG.md` next to locale files.

---

## Appendix A — Reference Legislation

- **Wage Protection Law 5718-1958** — payslip requirements.
- **Hours of Work and Rest Law 5711-1951** — overtime rates.
- **Minimum Wage Law 5747-1987** — minimum wage floor.
- **Severance Pay Law 5723-1963** — severance obligations.
- **Annual Leave Law 5711-1951** — vacation entitlement.
- **Sick Pay Law 5736-1976** — sick leave.
- **National Insurance Law (Consolidated Version) 5755-1995** — Bituach Leumi.
- **Income Tax Ordinance (New Version) 5721-1961** — income tax.
- **Value Added Tax Law 5736-1975** — VAT.
- **Privacy Protection Law 5741-1981** — privacy (Amendment 13, 2025).

---

**End of Translation Guide v1.0.0**
