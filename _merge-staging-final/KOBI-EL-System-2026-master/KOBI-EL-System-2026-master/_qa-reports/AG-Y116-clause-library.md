# AG-Y116 — Contract Clause Library

## Bilingual QA Report | דו"ח QA דו-לשוני

**Agent**       : Y-116
**Swarm**       : Documents
**Module**      : `onyx-procurement/src/docs/clause-library.js`
**Tests**       : `onyx-procurement/test/docs/clause-library.test.js`
**Report date** : 2026-04-11
**Status**      : GREEN — 26/26 tests passing, 0 external dependencies
**Relationship**: Complements **Y-108** (Document Templates) and **Y-115** (Legal Hold).
Y-116 scope = reusable **contract clauses** (legal building blocks).

---

## 1. Rule Compliance | תאימות לכללים

| Rule | Verification |
|---|---|
| "לא מוחקים רק משדרגים ומגדלים" | `upgradeClause()` appends version N+1, never mutates prior versions. `deprecateClause()` flips a flag and stores a reason + superseder — the clause head, all versions, all approvals, and all usage history are preserved (verified in test 21). |
| Zero external deps | Only `node:crypto` is `require()`'d. No `package.json` additions. |
| Hebrew RTL + bilingual labels | `CATEGORY_LABELS`, `RISK_LABELS`, `APPROVAL_STATUS_LABELS`, `JURISDICTION_LABELS`, `IL_LAW_CITATIONS`, and `HEBREW_GLOSSARY` all expose both `he` and `en` keys. Every clause carries `title_he`/`title_en` + `text_he`/`text_en`. |
| Append-only event log | `_event()` increments a monotonic `_seq` and pushes a frozen record. Test 25 verifies sequential ordering and that `clause.added`, `clause.upgraded`, `clause.approval`, `clause.deprecated`, `contract.assembled` all flow through it. |
| In-memory storage | Five `Map`s + one events `Array`, all instance-scoped on the `ClauseLibrary` instance. |

---

## 2. The 10 Categories | עשר קטגוריות

Exactly the 10 required categories are registered in `CATEGORIES` and enforced by
`addClause` / `upgradeClause` validation. Every category ships with a bilingual label.

| # | ID                 | עברית             | English                 | Typical Risk | Primary Israeli Law Citation |
|---|--------------------|-------------------|-------------------------|--------------|------------------------------|
| 1 | `confidentiality`  | סודיות            | Confidentiality         | low–high     | IL-CONTRACTS-GENERAL (חוק החוזים - חלק כללי 1973) |
| 2 | `liability`        | אחריות            | Liability               | medium–critical | IL-CONTRACTS-REMEDIES (חוק החוזים - תרופות 1970) |
| 3 | `termination`      | סיום התקשרות      | Termination             | medium–high  | IL-CONTRACTS-GENERAL (סעיפי ביטול ותרופות) |
| 4 | `payment`          | תשלום             | Payment Terms           | low–medium   | IL-SALE-LAW (חוק המכר 1968) |
| 5 | `ip`               | קניין רוחני       | Intellectual Property   | medium–high  | IL-COPYRIGHT (חוק זכות יוצרים 2007) |
| 6 | `warranty`         | אחריות / בדק      | Warranty                | medium       | IL-SALE-LAW + IL-CONSUMER-PROTECTION |
| 7 | `dispute`          | יישוב מחלוקות     | Dispute Resolution      | medium–critical | IL-ARBITRATION (חוק הבוררות 1968) |
| 8 | `force-majeure`    | כוח עליון         | Force Majeure           | low–medium   | IL-CONTRACTS-GENERAL (סיכול חוזה - סעיף 18) |
| 9 | `governing-law`    | דין חל            | Governing Law           | low          | IL-CONTRACTS-GENERAL |
| 10 | `data-protection` | הגנת מידע         | Data Protection         | high–critical | IL-PRIVACY (חוק הגנת הפרטיות 1981) |

Source of truth: `CATEGORIES` + `CATEGORY_LABELS` in `clause-library.js`.

---

## 3. Variable Syntax | תחביר משתנים דינמיים

Clauses embed placeholders using the pattern `{variableName}` which is matched
by the regex `/\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g`. At `assembleContract()` time, each
`{name}` is replaced with `String(variables[name])`. Any token that cannot be
resolved is **left as-is** and reported on `record.unresolvedVariables` so the
legal reviewer sees exactly which values are still missing.

### Built-in conventions

| Placeholder | Meaning (he)             | Meaning (en)             | Example value      |
|-------------|--------------------------|--------------------------|--------------------|
| `{party1}`  | צד ראשון / המזמין        | First party / Buyer      | `Techno-Kol Uzi בע"מ` |
| `{party2}`  | צד שני / הספק            | Second party / Supplier  | `Acme Supplier Ltd`  |
| `{amount}`  | סכום התקשרות             | Contract amount          | `500000`           |
| `{currency}`| מטבע                     | Currency                 | `ILS`              |
| `{date}`    | תאריך יעד / חתימה         | Target / signing date    | `2026-05-01`       |
| `{jurisdiction}` | סמכות שיפוט ייחודית | Exclusive jurisdiction   | `תל אביב`           |
| `{term}`    | תקופת החוזה              | Contract term            | `36 חודשים`         |
| `{notice_period}`| תקופת הודעה          | Notice period            | `30 ימים`           |
| `{law_reference}`| סימוכין חוק          | Statute reference        | `חוק החוזים 1973`   |
| `{court}`   | בית משפט                 | Court                    | `מחוזי תל אביב`     |

### Guarantees

- Regex is anchored to a safe identifier grammar — it never matches `{}` with
  spaces or punctuation, so legal Hebrew text containing `{...}` citation curly
  braces will not accidentally be substituted.
- Variables are extracted automatically from `text_he` + `text_en` if the
  caller does not pass `variables: [...]` explicitly at `addClause()`.
- `bilingualPairing()` cross-checks that every `{variable}` in Hebrew appears
  in English and vice-versa — a violation emits `VAR_MISSING_EN` / `VAR_MISSING_HE`
  on `issues`.

---

## 4. API Surface | ממשק הקוד

| Method | Purpose | Append-only? |
|---|---|---|
| `addClause({...})` | Register a new clause as v1 | yes — stores first `VersionRecord` |
| `upgradeClause(id, newVersion, changes)` | Create v(N+1) | yes — pushes to `_versions[id]` |
| `getClause(id, {version?, lang?})` | Fetch latest or specific version | read-only |
| `searchClauses({query, category, riskLevel, jurisdiction})` | TF-IDF ranked search | read-only |
| `assembleContract({templateId, clauseIds, variables})` | Build contract + substitute | appends to `_usage` and `_assemblies` |
| `compareClauseVersions(id, v1, v2)` | LCS-based line diff | read-only |
| `riskScore(contractText)` | Aggregate risk across matched clauses | read-only |
| `alternativeClauses(id)` | Same-category, different-risk clauses | read-only |
| `approvalWorkflow(id, approvers)` | Legal review with multi-reviewer aggregation | yes — stores `ApprovalRecord` |
| `usageAnalytics(id, period)` | Usage counts grouped by templateId | read-only |
| `deprecateClause(id, reason, supersededBy)` | Soft deprecate, redirect hint | yes — flag flip + event |
| `bilingualPairing(id)` | Semantic equivalence check Hebrew⇆English | read-only |

Auxiliary: `listClauses({includeDeprecated})`, `listVersions(id)`, `eventLog()`,
`getGlossary()`, `getCategories()`, `getCitations()`.

---

## 5. Risk Scoring Model | מודל ניקוד סיכון

`riskScore(contractText)` scans the assembled contract text for the
**bilingual title** of every clause in the library. Each hit contributes
its clause's weight from `RISK_WEIGHTS`:

| Risk | Weight | Hebrew label |
|---|---|---|
| `low`      | 1  | נמוך |
| `medium`   | 3  | בינוני |
| `high`     | 7  | גבוה |
| `critical` | 15 | קריטי |

Normalized ratio = `score / (matchedClauses * RISK_WEIGHTS.critical)`,
thresholds:

- `>= 0.66` → `critical`
- `>= 0.40` → `high`
- `>= 0.15` → `medium`
- otherwise → `low`

The result exposes `levelLabel` with both Hebrew and English, and the full
list of matched clauses (each with its category and weight).

---

## 6. Bilingual Pairing Algorithm | אלגוריתם התאמה דו-לשונית

`bilingualPairing(clauseId)` runs a rule-based heuristic scoring the
semantic equivalence of the Hebrew and English forms of the head version.
It is deterministic and dep-free.

| Check | Weight | Passes when |
|---|---|---|
| Variable parity | 0.30 | Every `{var}` in Hebrew appears in English and vice-versa |
| Numeric parity  | 0.25 | Sorted list of numeric tokens (5, 30, 2026...) is identical |
| Length ratio    | 0.15 | `heLen / enLen ∈ [0.4, 2.5]` |
| Glossary terms  | 0.30 | For every bilingual term pair from `HEBREW_GLOSSARY` found on one side, the counterpart is found on the other |

`equivalent = true` requires: score ≥ 0.75 AND no missing variables AND
numeric parity. Issues surface as typed codes: `VAR_MISSING_EN`,
`VAR_MISSING_HE`, `NUMERIC_MISMATCH`, `LENGTH_RATIO_OUT_OF_RANGE`.

---

## 7. Israeli Contract Law Citation Registry | מרשם ציטוטי חוק ישראלי

| Key                          | Hebrew                                            | English                                                  |
|------------------------------|---------------------------------------------------|----------------------------------------------------------|
| `IL-CONTRACTS-GENERAL`       | חוק החוזים (חלק כללי), תשל"ג-1973                 | Contracts Law (General Part), 5733-1973                  |
| `IL-CONTRACTS-REMEDIES`      | חוק החוזים (תרופות בשל הפרת חוזה), תשל"א-1970     | Contracts (Remedies for Breach of Contract) Law, 5731-1970 |
| `IL-STANDARD-CONTRACTS`      | חוק החוזים האחידים, תשמ"ג-1982                    | Standard Contracts Law, 5743-1982                        |
| `IL-SALE-LAW`                | חוק המכר, תשכ"ח-1968                              | Sale Law, 5728-1968                                      |
| `IL-PRIVACY`                 | חוק הגנת הפרטיות, תשמ"א-1981                      | Protection of Privacy Law, 5741-1981                     |
| `IL-COPYRIGHT`               | חוק זכות יוצרים, תשס"ח-2007                       | Copyright Law, 5768-2007                                 |
| `IL-ARBITRATION`             | חוק הבוררות, תשכ"ח-1968                           | Arbitration Law, 5728-1968                               |
| `IL-CONSUMER-PROTECTION`     | חוק הגנת הצרכן, תשמ"א-1981                        | Consumer Protection Law, 5741-1981                       |
| `IL-COMPANIES`               | חוק החברות, תשנ"ט-1999                            | Companies Law, 5759-1999                                 |
| `IL-ELECTRONIC-SIGNATURE`    | חוק חתימה אלקטרונית, תשס"א-2001                   | Electronic Signature Law, 5761-2001                      |

Callers can pass any citation key (or a free-form string) in `legalCitation`;
the clause stores the array as a frozen tuple inside the version record.

### Practical mapping: category → recommended citation

| Category          | Primary reference (key)         | Why |
|---|---|---|
| confidentiality   | `IL-CONTRACTS-GENERAL`          | General good-faith and interpretation rules (§12, §39) |
| liability         | `IL-CONTRACTS-REMEDIES`         | Statutory basis for damages, liquidated damages, mitigation |
| termination       | `IL-CONTRACTS-REMEDIES`         | Cancellation for breach + restitution |
| payment           | `IL-SALE-LAW`                   | Delivery-against-payment and default currency rules |
| ip                | `IL-COPYRIGHT`                  | Authorship, moral rights, license scope |
| warranty          | `IL-SALE-LAW`                   | Fitness, conformity, notice periods |
| dispute           | `IL-ARBITRATION`                | Enforcement of arbitration clauses and awards |
| force-majeure     | `IL-CONTRACTS-GENERAL` (§18)    | Frustration of contract (סיכול חוזה) |
| governing-law     | `IL-CONTRACTS-GENERAL`          | Choice of law autonomy of the parties |
| data-protection   | `IL-PRIVACY`                    | Processing, consent, data subject rights |

---

## 8. Hebrew Glossary | מילון מונחים עברית-אנגלית

Exposed as the frozen array `HEBREW_GLOSSARY` (30 entries) and reachable
via `lib.getGlossary()`. Every entry carries `he`, `en`, and a `role` tag.

| # | עברית                    | English                   | Role |
|---|--------------------------|---------------------------|------|
| 1 | חוזה                     | contract                  | core |
| 2 | סעיף                     | clause                    | core |
| 3 | הסכם                     | agreement                 | core |
| 4 | צד להסכם                 | party                     | party |
| 5 | סודיות                   | confidentiality           | category |
| 6 | אחריות משפטית            | liability                 | category |
| 7 | סיום התקשרות             | termination               | category |
| 8 | תנאי תשלום               | payment terms             | category |
| 9 | קניין רוחני              | intellectual property     | category |
| 10 | אחריות (בדק)            | warranty                  | category |
| 11 | יישוב מחלוקות            | dispute resolution        | category |
| 12 | כוח עליון                | force majeure             | category |
| 13 | הדין החל                 | governing law             | category |
| 14 | הגנת מידע                | data protection           | category |
| 15 | הפרה                     | breach                    | remedy |
| 16 | פיצוי מוסכם              | liquidated damages        | remedy |
| 17 | ציטוט חוק                | legal citation            | evidence |
| 18 | רמת סיכון                | risk level                | control |
| 19 | אישור משפטי              | legal approval            | control |
| 20 | גרסה                     | version                   | control |
| 21 | הסלמה                    | escalation                | workflow |
| 22 | הוצאה משימוש             | deprecation               | workflow |
| 23 | תחליף                    | superseded-by             | workflow |
| 24 | משתנים דינמיים           | dynamic variables         | assembly |
| 25 | הרכבת חוזה               | contract assembly         | assembly |
| 26 | התאמה דו-לשונית          | bilingual pairing         | evidence |
| 27 | ניתוח שימוש              | usage analytics           | analytics |
| 28 | השוואת גרסאות            | version diff              | evidence |
| 29 | בוררות                   | arbitration               | dispute |
| 30 | שיפוט ייחודי             | exclusive jurisdiction    | dispute |

---

## 9. Test Matrix | מטריצת מבחנים

Run: `node --test test/docs/clause-library.test.js`

Outcome: **26 tests, all passing, ~150 ms**.

| # | Test | Area | Result |
|---|---|---|---|
| 1 | `addClause` stores v1 | add | pass |
| 2 | `addClause` validates category/required/risk | add | pass |
| 3 | `addClause` rejects duplicate id | add | pass |
| 4 | `upgradeClause` appends v2 & head advances | upgrade | pass |
| 5 | `upgradeClause` preserves prior versions | append-only | pass |
| 6 | `upgradeClause` rejects non-increasing version | validation | pass |
| 7 | `getClause` language preference (he/en) | bilingual | pass |
| 8 | `getClause` explicit version lookup | read | pass |
| 9 | `searchClauses` TF-IDF ranking | search | pass |
| 10 | `searchClauses` category filter | search | pass |
| 11 | `assembleContract` substitutes `{party1}` `{amount}` `{currency}` `{date}` | assembly | pass |
| 12 | `assembleContract` reports unresolved variables | assembly | pass |
| 13 | `assembleContract` rejects missing clauses | validation | pass |
| 14 | `compareClauseVersions` diff stats (added/removed) | diff | pass |
| 15 | `riskScore` aggregates matched clauses | risk | pass |
| 16 | `riskScore` zero on empty contract | risk | pass |
| 17 | `alternativeClauses` same category, different risk | alternatives | pass |
| 18 | `approvalWorkflow` needs-revision on mixed reviews | approval | pass |
| 19 | `approvalWorkflow` flips approvalStatus when all approved | approval | pass |
| 20 | `usageAnalytics` groups by template, period filter | analytics | pass |
| 21 | `deprecateClause` preserves versions & usage | append-only | pass |
| 22 | `deprecateClause` getClause exposes redirect hint | deprecation | pass |
| 23 | `bilingualPairing` numeric mismatch detection | pairing | pass |
| 24 | `bilingualPairing` variable mismatch detection | pairing | pass |
| 25 | Event log append-only, monotonic seq | audit | pass |
| 26 | Glossary + IL law citations bilingual coverage | constants | pass |

Required minimum was 18 — delivered 26.

---

## 10. Integration Notes | הערות אינטגרציה

### Upstream consumers

- **Y-108 Templates** can now reference a `clauseId` list for each template slot.
  `assembleContract({templateId, clauseIds, variables})` is drop-in compatible
  with the template engine's rendering pipeline.
- **Y-109 Approval Engine** can call `approvalWorkflow()` directly or import
  `APPROVAL_STATUS` and `APPROVAL_STATUS_LABELS` for a shared vocabulary.
- **Y-115 Legal Hold** can freeze the `_assemblies` records by docId — every
  assembly carries an immutable `assemblyId` safe to reference.

### Downstream data flow

```
addClause → approvalWorkflow → (approved) → searchClauses → assembleContract
                                                ↓
                                          usageAnalytics
                                                ↓
                                          riskScore(contractText)
                                                ↓
                                         deprecateClause (if replaced)
                                                ↓
                                         supersededBy redirect
```

### Determinism & clocks

The constructor accepts an optional `{now: () => ms}` hook. Tests inject a
deterministic clock; production callers can pass `Date.now` (default) or
a frozen-time wrapper for reproducible audit replays.

### What is explicitly **not** in scope

- Persistence / DB adapter — the module is pure in-memory. Persistence lives in
  `onyx-procurement/src/db/` and is integrated by higher-level orchestrators.
- E-signature — handled by `onyx-procurement/src/contracts/` and `Y-110`.
- Multi-language beyond `he` / `en` — other locales are a future upgrade path
  (the rule is "upgrade & grow", never replace).

---

## 11. Files Delivered | קבצים שנמסרו

| File | Lines | Purpose |
|---|---|---|
| `onyx-procurement/src/docs/clause-library.js` | 790 | Implementation |
| `onyx-procurement/test/docs/clause-library.test.js` | 520 | 26 Node test-runner tests |
| `_qa-reports/AG-Y116-clause-library.md` | this file | Bilingual QA report |

---

## 12. Sign-off | אישור

- Immutable rule "לא מוחקים רק משדרגים ומגדלים" : **upheld** (tests 5, 21, 22, 25)
- Zero external deps : **upheld** (only `node:crypto` imported)
- Hebrew RTL + bilingual labels : **upheld** (every user-facing string has `he`/`en`)
- Israeli contract law context : **10 citations registered**, mapped to categories
- ≥ 18 tests required : **26 delivered, 26 passing**

**Agent Y-116 — ready for Swarm Documents handoff.**
