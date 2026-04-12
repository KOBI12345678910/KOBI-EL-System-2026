# AG-Y083 — Wire Transfer Approval Workflow Engine
# AG-Y083 — מנוע אישורים להעברות בנקאיות עם חתימות מרובות ובדיקות הונאה

**Agent:** Y-083 (Swarm Finance / Mega-ERP Kobi EL 2026)
**Date / תאריך:** 2026-04-11
**Module / מודול:** `onyx-procurement/src/finance/wire-approval.js`
**Tests / מבחנים:** `onyx-procurement/test/finance/wire-approval.test.js`
**Complements / משלים:** Y-081 signatory workflow, Y-092 IBAN validator, Y-148 sanctions feed
**Status / סטטוס:** PLAN-ONLY — no bank network calls, no money moved automatically.

---

## 1. Safety note / הערת בטיחות

> **EN:** Intent + approvals recorded. Execution must be performed by authorized
> human through bank channel. This module NEVER contacts a bank API, NEVER holds
> credentials to move money, NEVER auto-executes on a schedule. It only records
> intent, multi-signature chains, fraud checks, callback verifications, and an
> append-only audit trail. After a wire is fully signed and verified a HUMAN
> operator must carry the signed envelope to the bank portal / branch /
> corporate terminal for execution.

> **HE:** כוונת תשלום ואישורים נרשמים בלבד. הביצוע בפועל חייב להיעשות על-ידי
> מורשה חתימה דרך ערוץ הבנק. המודול הזה לא קורא ל-API בנקאי, לא שומר אישורי
> תשלום, לא מריץ ביצוע אוטומטי. הוא רושם אך ורק: כוונה, שרשרת חתימות, בדיקות
> הונאה, אימותים חוזרים, ומסלול ביקורת append-only. לאחר חתימה מלאה, מורשה
> חתימה בן-אדם חייב להעביר את המעטפה לערוץ הבנק (סניף / פורטל / מסוף ארגוני).

Every single wire envelope emitted by the engine carries the disclaimer in both
languages on the envelope itself, in the SWIFT/MT103 output, in the MASAV
output, in the CSV export, and in every execution marker.

---

## 2. Approval tiers / רמות אישור

The engine routes each wire into one of four immutable tiers based on the
amount converted to ILS via the injected FX table (defaults ILS 1, USD 3.7,
EUR 4.0, GBP 4.7, CHF 4.2, JPY 0.025).

| Tier / רמה | Amount range (ILS) | Signers required | Mandatory roles | Callback? |
|---|---|---|---|---|
| **T1 — Single / חתימה יחידה** | < 10,000 | 1 | finance_manager | No |
| **T2 — Dual / חתימה זוגית** | 10,000 – 100,000 | 2 | finance_manager (must) + controller | No |
| **T3 — CFO / סמנכ"ל כספים** | 100,000 – 1,000,000 | 2 | cfo (must) + finance_manager / controller | **Yes** |
| **T4 — Board / דירקטוריון** | > 1,000,000 | 3 | cfo + ceo + board_member (all three must) | **Yes** |

Routing rules:

- **Segregation of Duties (SoD):** initiator of a wire can never sign it.
- **No duplicate signers:** each user can only sign a given wire once.
- **mustInclude enforcement:** adding enough signatures but missing a
  mandatory role keeps the wire in `partially_signed` until the required role
  signs.
- **Tier promotion after signing:** once `signersRequired` is met and all
  `mustInclude` roles have signed:
  - If `callbackRequired` → status flips to `awaiting_callback`.
  - Otherwise → status flips to `ready_to_execute` (human must execute).

Tier labels ship bilingually in `routing.labels.he` and `routing.labels.en`.

---

## 3. Signature ledger / ספר חתימות

Each signature is appended to a SHA-256 chained ledger specific to the wire.
The chain is tamper-evident:

```
sig[n].chainHash = SHA-256({
  wireId, envelope: envelopeHash, seq: n,
  signerId, role, method, timestamp, prevHash: sig[n-1].chainHash
})
```

The first signature's `prevHash` is `null`. The engine exposes:

- `envelope.chainHead` — always the latest signature hash.
- `envelope.signatures[]` — full ordered chain.
- `envelope.envelopeHash` — immutable fingerprint of the wire intent
  (amount + beneficiary + purpose + value date + initiator + createdAt).

Supported signature methods: `digital`, `2fa`, `hardware-token`, `physical`.

---

## 4. Fraud-check signals / בדיקות הונאה — 6 אותות

`fraudCheck(wireId)` runs six independent signals. Each signal has a
bilingual human-readable label plus machine-readable detail. **A single firing
signal flips the wire status to `fraud_hold`**, so a human reviewer must
decide whether to void the wire or release it explicitly.

| # | Signal / אות | Trigger / טריגר | Default |
|---|---|---|---|
| 1 | **velocity / תדירות** — unusual frequency to same beneficiary | `> velocityLimit` wires to same beneficiary in last 24 h | `velocityLimit = 3` |
| 2 | **amount_anomaly / אנומליית סכום** — statistical outlier | `amountILS > mean + k·σ` over historical amounts | `anomalySigma = 3` |
| 3 | **new_beneficiary / מוטב חדש** — beneficiary age | First-seen age `< beneficiaryMinAgeDays` | `30` days |
| 4 | **after_hours / מחוץ לשעות** — outside business window | Israel local hour outside `[startHour, endHour)` | `09:00 – 17:00` |
| 5 | **round_number / סכום עגול** — exact 10k/100k/1M multiple | `amount % 10_000 == 0` in wire's own currency | always-on |
| 6 | **duplicate_24h / כפילות** — same amount + same beneficiary in 24 h | Prior wire with identical amount+currency+beneficiary within 24 h | always-on |

All fraud signals are visible on the wire envelope via `fraudSignals[]` and the
short-circuit boolean `fraudFlagged`. The audit trail records a `fraud_check`
entry with the signal IDs for every invocation.

---

## 5. Callback verification / אימות חוזר

For any wire whose routed tier has `callbackRequired === true` (T3 and T4, i.e.
every transfer above 100,000 ILS equivalent), the engine parks the wire in
`awaiting_callback` after the last signature. `callbackVerification(args)`
records an out-of-band phone / in-person confirmation (`method: 'phone' |
'in-person'`) with the verifier's id and free-text notes. Only after the
verification record lands does the wire advance to `ready_to_execute`.

For low-value wires, callbacks are still *allowed* (extra precaution) and are
flagged with `mandatory: false`.

---

## 6. Output formats / פורמטי פלט

`generateBankInstructions(wireId, { format })` produces PLAN-ONLY text in
three formats. **Every output carries the bilingual disclaimer as an inline
comment** so the file can never be confused for an automatic execution.

### 6.1 SWIFT MT103 / ‏SWIFT MT103

Simplified but parseable MT103 envelope with the standard tag set:

| Tag | Meaning | Field in our envelope |
|---|---|---|
| `{1:…}` | Basic header (sender BIC) | TechnoKol hard-coded |
| `{2:I103…}` | Application header (type 103, receiver BIC) | `beneficiary.swift` |
| `:20:` | Sender's reference | `wireId` stripped to 16 chars |
| `:23B:` | Bank operation code | `CRED` |
| `:32A:` | Value date + currency + amount | `YYMMDD` + `CCY` + `amount` |
| `:50K:` | Ordering customer | `TECHNO-KOL-UZI-LTD` |
| `:59:` | Beneficiary | `/IBAN` + name + bank + country |
| `:70:` | Remittance info | `purpose` truncated to 140 |
| `:71A:` | Charges | `SHA` |
| `{5:{CHK:…}}` | Trailer | placeholder |
| `// PLAN-ONLY …` | Bilingual disclaimer | always appended |

### 6.2 MASAV (מס"ב)

Israeli domestic payments file layout, simplified to a single pipe-delimited
"K" record including record type, institute, date, beneficiary name (padded),
amount in agorot, and ISO currency. Bilingual disclaimer is always appended as
a comment.

### 6.3 CSV

One-row human-readable CSV for reconciliation / review. Header includes:
`wireId, amount, currency, beneficiary, iban, swift, bank, country, purpose,
status, disclaimer`. The disclaimer is embedded on every row to prevent
semantic drift in spreadsheet copy-paste.

---

## 7. Test coverage / כיסוי מבחנים

```
> node --test test/finance/wire-approval.test.js
ℹ tests     36
ℹ suites    10
ℹ pass      36
ℹ fail       0
ℹ skipped    0
```

### Suite map

1. `validateBeneficiary` — 5 tests: IBAN checksum (Y-92), bad IBAN, SWIFT
   format, sanctions hook (Y-148), whitelist behaviour.
2. `routeForApproval — 4-tier amount routing` — 4 tests, one per tier.
3. `addSignature — SHA-256 chained ledger, SoD, mustInclude` — 4 tests.
4. `fraudCheck — 6 signals` — 7 tests (6 individual + fraud_hold status flip).
5. `callbackVerification — mandatory for > 100k ILS` — 3 tests.
6. `executeMarker — PLAN-ONLY enforcement` — 3 tests (status gating,
   bank-ref recording, post-execution immutability).
7. `voidWire — preserves the record` — 2 tests (no delete, still retrievable).
8. `generateBankInstructions — SWIFT / MASAV / CSV` — 4 tests.
9. `auditTrail + dailyReport` — 2 tests (chain verification + tier aggregation).
10. `exported helpers` — 2 tests for the standalone IBAN and SWIFT validators.

All 36 tests pass with Node `node --test`, zero external dependencies.

---

## 8. Append-only guarantees / הבטחות "לא מוחקים"

| Object | Never removed | Preserved on |
|---|---|---|
| Wire envelope | ✔ | `voidWire`, `executeMarker`, fraud hold |
| Signatures[] | ✔ | every status transition |
| Audit trail entries | ✔ | append-only, SHA-256 chained |
| Fraud signals | ✔ | overwritten-by-replacement array on each `fraudCheck` call, but every call adds a new audit entry |
| Beneficiary first-seen timestamps | ✔ | cached once per beneficiary key |

`voidWire` flips status to `voided`, preserves all nested data, and adds a
`void` entry to the audit trail. Nothing is ever erased.

---

## 9. Integration hooks / ממשקי אינטגרציה

| Hook | Role | Default |
|---|---|---|
| `ibanValidator` | Y-92 validator; must return `{valid, reason?}` | local mod-97 (IBAN_LENGTH_BY_COUNTRY covers 40+ countries) |
| `sanctionsHook` | Y-148 sanctions screen; must return `{clean, reason?}` | `null` (not configured → warning, not hard fail) |
| `whitelist` | Trusted beneficiaries list of `{iban?, swift?, name?}` | `[]` |
| `historicalAmounts` | Prior wire amounts in ILS for sigma check | `[]` (sigma check disabled until ≥ 2 historicals) |
| `businessHours` | `{startHour, endHour}` 24h for after-hours check | `{9, 17}` |
| `clock` | Epoch-ms clock (injectable for tests) | `Date.now` |
| `fxToILS` | Currency → ILS rate table for tier routing | indicative defaults |

---

## 10. Hebrew glossary / מילון מונחים

| EN | HE | Notes |
|---|---|---|
| Wire transfer | העברה בנקאית (וייר) | outbound SWIFT or domestic מס"ב |
| Beneficiary | מוטב | recipient of the transfer |
| Signatory | מורשה חתימה | signing authority |
| Multi-signature | חתימות מרובות | chained signature ledger |
| Segregation of duties | הפרדת תפקידים | initiator ≠ signer |
| Fraud check | בדיקת הונאה | 6 signals, non-blocking but flags |
| Velocity | תדירות | frequency of wires to same beneficiary |
| Anomaly | אנומליה | statistical outlier vs historical |
| After-hours | מחוץ לשעות עבודה | outside 09:00-17:00 Israel |
| Round-number | סכום עגול | exact 10k/100k/1M multiple |
| Duplicate | כפילות | same amount + beneficiary in 24h |
| Callback verification | אימות חוזר | out-of-band phone / in-person confirmation |
| Approval tier | רמת אישור | one of T1..T4 |
| Audit trail | מסלול ביקורת | append-only chained ledger |
| Execute marker | סימון ביצוע | records that a human ran the transfer |
| Void | ביטול | status flip, record preserved |
| Sanctions screen | סריקת סנקציות | OFAC / UN / EU / IL list |
| Whitelist | רשימת מוטבים מאושרים | known-good beneficiaries |
| SHA-256 chain | שרשרת SHA-256 | tamper-evident signature linkage |
| SWIFT MT103 | הודעת SWIFT MT103 | single customer credit transfer |
| MASAV | מס"ב | Israeli domestic clearing file |
| PLAN-ONLY | תכנון בלבד | never executes, always human-in-the-loop |
| CFO | סמנכ"ל כספים | Chief Financial Officer |
| CEO | מנכ"ל | Chief Executive Officer |
| Board member | חבר דירקטוריון | required for > 1M ILS |
| Finance manager | מנהל כספים | required on Tiers 1 and 2 |
| Controller | חשב | optional secondary signer |

---

## 11. Compliance cross-reference / הצלבת תאימות

| Control | Addressed by |
|---|---|
| **Multi-signature (dual-control)** | Tiers T2-T4 + `signersRequired` + `mustInclude` roles |
| **Segregation of Duties** | `addSignature` rejects when `signerId === initiator.id` |
| **Tamper evidence** | SHA-256 chained ledger + `envelopeHash` |
| **Anti-fraud / BEC-defeat** | 6-signal fraud check + mandatory callbacks on > 100k |
| **Sanctions screening** | `sanctionsHook` integration point → Y-148 feed |
| **IBAN / SWIFT integrity** | Y-92 validator + local fallback (mod-97) |
| **Audit trail immutability** | `auditTrail` append-only + verify chain on read |
| **PLAN-ONLY execution boundary** | `executeMarker` is the ONLY way to mark a wire "executed" and requires explicit bank reference from a human |
| **Retention ("לא מוחקים")** | every object preserved; `voidWire` is a status flip only |

---

## 12. Non-goals / מה המודול לא עושה

- Does **not** connect to banks.
- Does **not** store banking credentials.
- Does **not** validate sanctions against a live feed on its own — it relies
  on the Y-148 hook that the caller must wire in.
- Does **not** persist to disk — storage is in-memory append-only. A separate
  persistence agent must subscribe to the audit trail and stream it to
  durable storage.
- Does **not** implement timeouts / expiry — the Y-081 signatory workflow
  handles request lifetimes; this engine focuses on the approval chain and
  fraud checks only.

---

## 13. Files changed / קבצים
### Created
- `onyx-procurement/src/finance/wire-approval.js` — engine (≈820 lines)
- `onyx-procurement/test/finance/wire-approval.test.js` — 36 tests
- `_qa-reports/AG-Y083-wire-approval.md` — this report
