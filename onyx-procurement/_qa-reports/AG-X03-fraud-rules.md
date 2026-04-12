# QA Report — AG-X03 Fraud Detection Rules Engine

**Agent:** X-03 (Swarm 3)
**System:** Techno-Kol Uzi ERP — Kobi EL mega-ERP 2026
**Date:** 2026-04-11
**Status:** GREEN — 58 / 58 unit tests passing (zero deps)

## Deliverables

| File | Path | Purpose |
| --- | --- | --- |
| `fraud-rules.js` | `onyx-procurement/src/security/fraud-rules.js` | Declarative fraud-detection rules engine |
| `fraud-rules.test.js` | `onyx-procurement/test/payroll/fraud-rules.test.js` | 58 unit tests covering every rule + API |
| `AG-X03-fraud-rules.md` | `onyx-procurement/_qa-reports/AG-X03-fraud-rules.md` | This QA report |

## Scope

Declarative, zero-dependency fraud detection rules engine for invoices,
vendors, payments and payroll. Every rule is bilingual (Hebrew + English)
with explicit severity (1-10). Non-destructive by design — rules can be
added through `addRule()` but never removed.

## Public API

| Export | Signature | Notes |
| --- | --- | --- |
| `evaluateRules(ctx)` | `ctx -> { risk_score, triggered_rules[], recommended_action }` | Null/undefined safe |
| `addRule(rule)` | `rule -> frozen rule` | Rejects duplicate IDs + invalid fields |
| `listRules()` | `() -> Rule[]` | Shallow copy |
| `getRuleById(id)` | `id -> Rule | null` | |
| `explainDecision(res)` | `res -> { he, en, summary }` | Bilingual human-readable explanation |
| `_internals` | helpers | `isValidTZ`, `isRoundAmount`, `ibanCountry`, etc. for reuse/tests |

Thresholds on `risk_score` (0-100): `<25` allow, `25..<60` review, `>=60`
block. Raw severity sum is combined with an emphasizing boost so that a
single severity-10 rule already crosses the review threshold.

## Built-in rules (32 total, >= 30 required)

| ID | Severity | EN / HE name |
| --- | --- | --- |
| FR-001 | 7 | Amount just below approval threshold / סכום סמוך לתקרת אישור |
| FR-002 | 8 | New vendor + invoice within 24h / ספק חדש + חשבונית תוך 24 שעות |
| FR-003 | 9 | Bank account changed + payment / חשבון בנק שונה + תשלום |
| FR-004 | 4 | VAT ID not validated / מספר ע"מ לא אומת |
| FR-005 | 5 | Red-flag vendor name w/o Israeli reg / שם ספק חשוד ללא רישום |
| FR-006 | 4 | Round amounts, high frequency / סכומים עגולים בתדירות גבוהה |
| FR-007 | 6 | Sequential invoice numbers / מספרי חשבוניות עוקבים |
| FR-008 | 9 | Split invoice evading threshold / פיצול חשבונית לעקיפת סף |
| FR-009 | 6 | Duplicate desc, different vendor / תיאור כפול מספק אחר |
| FR-010 | 7 | Future invoice date / תאריך חשבונית עתידי |
| FR-011 | 7 | Payment before invoice date / תשלום לפני תאריך החשבונית |
| FR-012 | 5 | Missing supporting docs / חסרים מסמכים תומכים |
| FR-013 | 9 | Vendor address = employee address / כתובת ספק = עובד |
| FR-014 | 9 | High-risk IBAN country / IBAN במדינה בסיכון |
| FR-015 | 3 | Weekend transaction / פעולה בסוף שבוע |
| FR-016 | 4 | Out-of-hours transaction / פעולה מחוץ לשעות העבודה |
| FR-017 | 3 | Holiday transaction / פעולה ביום חג |
| FR-018 | 5 | Employee multiple bank accounts / עובד עם כמה חשבונות בנק |
| FR-019 | 10 | Salary paid to wrong account / משכורת לחשבון שגוי |
| FR-020 | 10 | Duplicate TZ across employees / ת.ז כפולה |
| FR-021 | 5 | Unusually high overtime / שעות נוספות חריגות |
| FR-022 | 6 | Invalid TZ check digit / ת.ז לא תקינה |
| FR-023 | 5 | Vendor has no VAT ID / ספק ללא מספר ע"מ |
| FR-024 | 6 | Non-positive invoice amount / סכום שלילי/אפס |
| FR-025 | 8 | Duplicate invoice number from vendor / מספר חשבונית חוזר |
| FR-026 | 4 | Invoice >= 10x threshold / חריגה גבוהה מתקרה |
| FR-027 | 3 | Blank/generic description / תיאור ריק או גנרי |
| FR-028 | 7 | Payment != invoice amount / סכום תשלום שונה |
| FR-029 | 4 | Very old invoice submitted now / חשבונית ישנה |
| FR-030 | 8 | Same user created vendor + approved invoice / הפרדת תפקידים |
| FR-031 | 10 | Employee bank account = vendor bank account / חשבון עובד = ספק |
| FR-032 | 4 | Invoice without linked PO / חשבונית ללא הזמנת רכש |

All rule fields (`id`, `name_he`, `name_en`, `severity`, `check`,
`message_he`, `message_en`) are validated on registration, and each
built-in rule object is `Object.freeze()`d to prevent mutation. A custom
rule whose `check()` throws is caught — its failure can never poison the
evaluation pipeline.

## Test coverage

`node --test test/payroll/fraud-rules.test.js`

```
tests     58
suites    0
pass      58
fail      0
cancelled 0
skipped   0
todo      0
duration  ~185 ms
```

Test breakdown:

1. **Registry & metadata (3)** — `01` rule count >=30, `02` unique IDs +
   required fields, `03` `getRuleById` lookup.
2. **Clean / empty contexts (3)** — `04` clean base context yields
   `allow/0`, `05` empty ctx doesn't crash, `06` null/undefined safe.
3. **Per-rule triggers (34)** — every built-in FR-001..FR-032 has at
   least one positive test (FR-008 and FR-013 each have two variants).
4. **Scoring & recommended_action (5)** — `41` low-severity still allows,
   `42` high-severity escalates, `43` multi-hit blocks, `44` score
   clamped to 100, `45` thresholds map correctly.
5. **addRule / custom rules (3)** — `46` registration works end-to-end,
   `47` duplicate-id rejection, `48` schema validation.
6. **explainDecision (3)** — `49` bilingual output, `50` allow text, `51`
   rejects non-object.
7. **Internal helpers (5)** — `52-56` cover `isValidTZ`, `isRoundAmount`,
   `countSequential`, `ibanCountry`, `normAddr`.
8. **Safety (2)** — `57` a throwing custom rule cannot corrupt results,
   `58` triggered entries carry severity + bilingual name/message.

Total: **58 tests**, target was ">=30 cases" — exceeded by 93%.

## Guarantees

- **Zero dependencies.** Only `node:test` / `node:assert/strict` are
  used in the test file; production code uses only core JS.
- **Non-destructive.** There is no `removeRule`. Built-in rules are
  frozen. `addRule` append-only.
- **Bilingual.** Every rule and the `explainDecision` output render
  Hebrew and English text side by side.
- **Security-critical hardening.** Rule-check exceptions are caught so
  a bad custom rule cannot take the engine down; `risk_score` is
  always in `[0, 100]`; scoring is deterministic (no `Math.random`).
- **Drop-in.** Exports via CommonJS, path matches
  `src/security/fraud-rules.js` as requested.

## Example usage

```js
const { evaluateRules, explainDecision } = require('./src/security/fraud-rules');

const decision = evaluateRules({
  now: '2026-04-11T10:00:00Z',
  approval_threshold: 5000,
  split_threshold: 5000,
  vendor: { id: 'V-1', name: 'Acme Ltd', created_at: '2026-04-11T09:00:00Z', israeli_registered: false },
  invoice: { id: 'I-9', number: 'INV-4999', amount: 4999, invoice_date: '2026-04-11T09:30:00Z' },
  payment: { initiated_at: '2026-04-11T10:00:00Z', amount: 4999, destination_country: 'IL' },
});

// decision.risk_score          -> e.g. 55
// decision.triggered_rules[*]  -> [{ id, severity, name_he, name_en, message_he, message_en }, ...]
// decision.recommended_action  -> 'review'

const exp = explainDecision(decision);
console.log(exp.he); // Hebrew summary
console.log(exp.en); // English summary
```

## Verification

- `node -e "require('./src/security/fraud-rules')"` — module loads, 32
  rules registered.
- `node --test test/payroll/fraud-rules.test.js` — 58 / 58 pass.
- No external packages, no filesystem writes, no network access.
- Rule IDs FR-001..FR-032 are stable and can be referenced by UI,
  SIEM, or downstream audit log.

## Sign-off

Agent X-03 — Fraud rules engine ready for integration by downstream
Swarm 3 agents (payroll validator, AP bridge, SIEM notifier).
