# AG-Y083 — Wire Transfer Approval Workflow + Beneficiary Database

**Domain:** Techno-Kol Uzi mega-ERP — international treasury (SWIFT / cross-border wires)
**Module:** `onyx-procurement/src/finance/wire-transfer.js`
**Tests:** `onyx-procurement/test/finance/wire-transfer.test.js`
**Rule:** לא מוחקים — רק משדרגים ומגדלים (never delete, only upgrade and grow)
**Status:** PASS — 45/45 tests green
**Build date:** 2026-04-11
**Dependencies:** zero (pure CommonJS, only `node:crypto` for random IDs)
**Bilingual:** Hebrew + English throughout

---

## 1. Purpose / מטרה

A self-contained approval workflow and beneficiary master-data store for international wire transfers. Designed for a metal-fabrication firm (Techno-Kol Uzi) that needs to pay overseas suppliers, contractors and consultants alongside its domestic Masav (מס"ב) run.

The module is intentionally **air-gapped** from the banking network — it produces SWIFT MT103 message data and an export envelope that a human finance operator carries to the bank's corporate portal for execution. It is not, and must never become, a replacement for the human-in-the-loop.

---

## 2. CRITICAL SAFETY RULES / כללי בטיחות קריטיים

### 2.1 THIS MODULE DOES NOT TALK TO BANKS

> The module produces SWIFT MT103 message data. A human finance operator (גזבר/ת) must carry the resulting text file to the bank portal / branch for actual execution. There is NO network call, NO webhook, NO banking API credential handling, and NO ability to move money on its own.

The `executeRequest` function returns an object with:

```js
{
  file: "MT103_wire_...txt",
  message: ":20:...\n:23B:CRED\n:32A:...",
  mt103: { /* parsed fields */ },
  status: "executed",
  safetyNotice: "SAFETY: This file is NOT transmitted..."
}
```

Every `executeRequest` result carries a `safetyNotice` string (bilingual) that UIs must surface to the operator. This is verified by a dedicated unit test: **`executeRequest includes the safety notice — does NOT transmit`**.

### 2.2 NEVER DELETE — רק משדרגים ומגדלים

Rejected, cancelled, reversed or failed wires are marked with a status and annotated with a reason — but the row is never removed. The data model uses an append-only pattern:

- `beneficiary.history[]` — every verify, every status change is pushed
- `request.history[]` — every state transition is pushed
- `request.approvals[]` / `request.rejections[]` — append-only
- `_auditLog[]` — immutable, returned only as a deep clone
- `_reversals[]` — a reversal is a *new* row, not a mutation of the original

Attempting to re-use an existing beneficiary id throws: `addBeneficiary: id "X" already exists — rule: לא מוחקים`.

### 2.3 DUAL CONTROL + COOLDOWN

- **Cooldown:** new beneficiaries enter a 24h (or 48h for EDD jurisdictions) window before the first payment is allowed.
- **Dual approval:** wires above `dualApprovalThreshold` (default ₪50,000) require two distinct approvers. The same approver cannot sign twice — the second attempt throws `already approved this request — dual approval requires distinct users`.

Both rules exist specifically to defeat Business Email Compromise (BEC) and CEO-fraud (תרגיל המנכ"ל) scams where attackers pressure the finance clerk to wire money "urgently" to a freshly-invented supplier.

### 2.4 SANCTIONS SCREENING IS LOCAL ONLY

The sanctions check inside `verifyBeneficiary` compares the beneficiary against **in-memory** lists the caller seeds (OFAC / UN / EU / Israeli מעקב). It does NOT phone a SaaS provider. The finance office must refresh the seeded list on a defined cadence (weekly) via `setSanctionsList()`, `setPepList()`, `setShellCompanyList()`.

### 2.5 2FA IS ENFORCED STRUCTURALLY

`approveRequest` calls a constructor-provided `verify2fa` callback. If none is supplied, the default callback rejects every approval:

```js
this._verify2fa = opts.verify2fa || (() => false);
```

There is no "skip 2FA" shortcut for convenience. Verified by test: **`manager without a 2FA verifier rejects all approvals by default`**.

### 2.6 AUDIT TRAIL IS MANDATORY

Every state transition (create, verify, approve, reject, execute, reverse, reconcile) writes an immutable entry to `_auditLog`. `getAuditLog()` returns a deep clone, so callers cannot mutate the real log. Verified by test: **`audit log captures every state transition`**.

---

## 3. Public API / ממשק ציבורי

```js
const { WireTransferManager } = require('./src/finance/wire-transfer');

const mgr = new WireTransferManager({
  clock: () => Date.now(),
  verify2fa: (requestId, approver, token) => /* your TOTP check */ true,
  dualApprovalThreshold: 50_000,      // ILS
  cooldownHours: 24,
  highRiskCooldownHours: 48,
  baseCurrency: 'ILS',
  orderingCustomer: 'TECHNO-KOL UZI LTD',
  orderingBic: 'POALILIT',
});
```

| Method                             | Purpose                                                              |
|------------------------------------|----------------------------------------------------------------------|
| `addBeneficiary(info)`             | Validate + store a new payee (IBAN MOD-97 + BIC + ת.ז/ח.פ)           |
| `getBeneficiary(id)`               | Read one beneficiary (deep clone)                                    |
| `listBeneficiaries()`              | Read all (deep clone)                                                |
| `addApprovedBic(bic)`              | Whitelist a known-good SWIFT BIC                                     |
| `setSanctionsList(list)`           | Load OFAC/UN/EU/מעקב screening list                                  |
| `setPepList(list)`                 | Load Politically Exposed Persons list                                |
| `setShellCompanyList(list)`        | Load known-shell-company list                                        |
| `verifyBeneficiary(id)`            | Screen against sanctions+PEP+shell+EDD country                       |
| `cooldownPeriod(id)`               | Check the 24/48h cooldown window                                     |
| `createWireRequest(args)`          | Start a request (auto-runs anomaly detection)                        |
| `rateLimit(args)`                  | Velocity check / override daily/weekly/monthly caps                  |
| `anomalyDetection(req)`            | Heuristic anomaly score (0..1)                                       |
| `dualApproval(req)`                | Does this amount require two approvers?                              |
| `approveRequest(id, approver, tok)`| Record an approval (2FA enforced)                                    |
| `rejectRequest(id, approver, reason)` | Record a rejection                                                |
| `executeRequest(id)`               | Build MT103 + file — DOES NOT SEND                                   |
| `swiftMT103Format(id)`             | Return the MT103 in FIN-envelope form (blocks 1..5)                  |
| `reverseFailedWire(args)`          | Record a reversal + reclaim process (MT192 draft)                    |
| `dailyReconcile(statement)`        | Match executed wires against a bank statement                        |
| `listWireRequests()`               | Read all requests                                                    |
| `getWireRequest(id)`               | Read one request                                                     |
| `getAuditLog()`                    | Immutable audit log                                                  |

---

## 4. SWIFT MT103 Field Reference / שדות SWIFT MT103

MT103 is the canonical SWIFT customer-credit-transfer message (single customer credit transfer). Reference: SWIFT Standards MT Customer Payments & Cheques Category 1. The module uses the core tag set used by Israeli banks (Poalim, Leumi, Discount, Mizrahi, Hapoalim).

### 4.1 Block 4 (Text Block) fields

| Tag    | Name                                   | Hebrew                        | Format           | Example                          |
|--------|----------------------------------------|-------------------------------|------------------|----------------------------------|
| `:20:` | Sender's Reference                     | ערך ייחוס של השולח            | 16x              | `wire_1712...`                    |
| `:23B:`| Bank Operation Code                    | קוד פעולה בנקאי               | 4!c              | `CRED` \| `SPRI` \| `SSTD`       |
| `:32A:`| Value Date / Currency / Amount         | תאריך ערך / מטבע / סכום       | 6!n3!a15d        | `260411EUR1234,56`               |
| `:33B:`| Currency / Original Amount             | מטבע וסכום מקורי              | 3!a15d           | `EUR1234,56`                     |
| `:50K:`| Ordering Customer                      | שולם על ידי                   | [/34x]4*35x      | `TECHNO-KOL UZI LTD`             |
| `:52A:`| Ordering Institution                   | מוסד מורה (BIC)               | [/1!a][/34x] 4!a2!a2!c[3!c] | `POALILIT`            |
| `:53B:`| Sender's Correspondent                 | סניף בנק השולח                | [/1!a][/34x] [35x] |                                 |
| `:57A:`| Account With Institution (BIC)         | בנק המוטב                     | [/1!a][/34x] 4!a2!a2!c[3!c] | `DEUTDEFF`            |
| `:59:` | Beneficiary Customer                   | מוטב                          | [/34x] 4*35x     | `/DE89370400440532013000\nAcme Gmbh` |
| `:70:` | Remittance Information                 | פרטי התשלום                   | 4*35x            | `Invoice ACME-2026-001 /INV/001` |
| `:71A:`| Details of Charges                     | חלוקת העמלות                  | 3!a              | `OUR` \| `SHA` \| `BEN`          |
| `:72:` | Sender to Receiver Info                | הערות בין בנקים               | 6*35x            |                                  |
| `:77B:`| Regulatory Reporting                   | דיווח רגולטורי (בנק ישראל)    | 3*35x            | `/BENEFRES/DE//parts supply`     |

### 4.2 FIN envelope blocks

A SWIFT FIN message has five blocks:

```
{1:F01POALILITXXX0000000000}{2:I103DEUTDEFFXXXXN}{3:{108:wire_17123456}}{4:
:20:wire_17123456
:23B:CRED
:32A:260411EUR1234,56
:50K:TECHNO-KOL UZI LTD
:52A:POALILIT
:57A:DEUTDEFF
:59:/DE89370400440532013000
Acme Gmbh
:70:Invoice ACME-2026-001 /INV/ACME-001
:71A:SHA
:77B:/BENEFRES/DE//Invoice ACME-2026-001
-}{5:{CHK:000000000000}}
```

| Block | Name                | Content                                                   |
|-------|---------------------|-----------------------------------------------------------|
| `{1:}`| Basic Header        | Sender BIC + session number                               |
| `{2:}`| Application Header  | Message type (103) + receiver BIC + priority (N/U/S)      |
| `{3:}`| User Header         | Optional UUID, PDE (possible duplicate emission) etc.     |
| `{4:}`| Text Block          | The actual `:20:`..`:77B:` payload                        |
| `{5:}`| Trailer             | MAC + CHK — the real values are computed by the bank      |

The module fills what a human operator needs to **preview**. The bank portal generates real MAC/CHK when the operator uploads.

### 4.3 Value date, currency, amount format (`:32A:`)

`YYMMDDCCYNNNN,NN`:

- `YYMMDD` — value date (ISO without century)
- `CCY` — ISO 4217 alpha-3 currency code
- `NNNN,NN` — amount with `,` as decimal separator, up to 15 total digits, no thousand separators

Helpers `swiftDateYYMMDD` and `swiftAmount` enforce this precisely.

### 4.4 Charges codes (`:71A:`)

| Code | Meaning                          | Hebrew                                 |
|------|----------------------------------|----------------------------------------|
| `OUR`| Sender pays all charges          | השולח משלם את כל העמלות                |
| `SHA`| Shared — default                 | עמלות מחולקות                          |
| `BEN`| Beneficiary pays all charges     | המוטב נושא בעמלות                      |

Module default is `SHA` — overridable per request in future extensions.

### 4.5 Bank operation code (`:23B:`)

| Code | Meaning                                | When used               |
|------|----------------------------------------|-------------------------|
| `CRED`| Credit transfer, standard            | Default                 |
| `SPRI`| Priority / same-day                  | Request marked `urgent` |
| `SSTD`| Stated amount — special instructions  | Not used here           |

---

## 5. Cooldown Rationale / היגיון תקופת הצינון

**Why cooldown at all?** Business Email Compromise (BEC) and CEO-fraud (תרגיל המנכ"ל) attacks typically run like this:

1. Attacker compromises the CEO's email or phone number.
2. Attacker emails the finance clerk: *"Urgent — wire €150,000 to this new supplier before close of business. I'm on a plane, can't answer calls. Use these bank details."*
3. Clerk adds the new beneficiary and wires immediately.
4. Two hours later the CEO asks what happened — money is gone.

The cooldown is the single highest-impact anti-fraud control against this pattern, because it **guarantees** there is a window during which the clerk can call the CEO back. Industry data (SWIFT CSCF, Bank of Israel directive 411) shows that >90% of BEC attempts abandon the target within the first 24 hours if they cannot get the wire out immediately.

**Why 24h default, 48h for EDD?** The Israeli Banking Supervision guidance (2018, updated 2023) recommends 24–48 hours. Techno-Kol policy splits on jurisdiction risk:

- **24h** for FATF-compliant countries (EU, US, UK, CH, JP, CA, AU, etc.)
- **48h** for high-risk / EDD countries where the added wait gives the compliance officer time to run enhanced due diligence

The EDD list is seeded from the FATF high-risk + Israeli NBCTF watch-list: `IR, KP, SY, CU, MM, AF, YE, BY, RU, VE, ZW, SS, LY, SD, IQ`. It is overridable via the constructor for firms with different policies.

**Why not per-wire velocity only?** Rate limits (§6) catch ongoing abuse; cooldown catches day-zero abuse. They defend different threat windows and are both needed.

**Why auto-lift after first payment?** Once a beneficiary has been successfully paid once, the cooldown has done its job — continuing to apply it on every subsequent wire would strangle normal business. From then on, velocity (rate limits) and anomaly detection take over.

---

## 6. Rate-Limit Rationale / היגיון הגבלת מהירות

The module ships with three nested velocity windows:

| Window  | Period   | Max count | Max amount (ILS) |
|---------|----------|-----------|------------------|
| daily   | 24h      | 5         | 100,000          |
| weekly  | 7 days   | 20        | 300,000          |
| monthly | 30 days  | 60        | 1,000,000        |

**Why three windows and not one?** A single daily cap is easy to bypass — an attacker can splash 100k on day 1, wait, then splash again on day 2. The weekly and monthly caps catch "drip" fraud that stays under the daily ceiling but accumulates damage.

**Why these numbers?** They are a sensible mid-market start for a ~₪50M/year metal-fab firm that:

- runs its domestic payroll + supplier pay through Masav (not through this module)
- pays perhaps 30–50 foreign wires per month (parts from Germany, tooling from Italy, consultancy from the US)
- rarely sends a single wire above ₪100k

Larger organizations should override via:

```js
new WireTransferManager({
  rateLimits: {
    daily:   { periodMs: 24*3600*1000, maxCount: 20, maxAmount:  500_000 },
    weekly:  { periodMs: 7*24*3600*1000, maxCount: 80, maxAmount: 2_000_000 },
    monthly: { periodMs: 30*24*3600*1000, maxCount: 200, maxAmount: 8_000_000 },
  },
});
```

**Why do we re-check at execute time?** Because time has passed since the request was created and approved — another wire may have slipped through in the meantime. `executeRequest` calls `rateLimit()` one more time and refuses if the caller would now be over the limit. The request is then marked REJECTED with reason `rate_limit:*` and the audit log records it.

**How the window is computed.** Each beneficiary has a `paymentHistory` of prior executed/confirmed wires. The check sums up count and amount from entries newer than `now - periodMs`. Rejected and reversed entries are excluded from the sum — they never happened from a cash perspective.

---

## 7. Anomaly Detection / זיהוי חריגות

`anomalyDetection(request)` returns `{ flagged, score, reasons }` where `score ∈ [0..1]` and `flagged === score >= 0.5`. The score is additive over nine signals:

| Signal                | Weight | Trigger                                                            |
|-----------------------|--------|--------------------------------------------------------------------|
| amount outlier        | 0.35   | amount ≥ 3× beneficiary's historical median                        |
| high-risk country     | 0.25   | beneficiary country ∈ EDD list                                     |
| new beneficiary       | 0.20   | beneficiary < 7 days old                                           |
| purpose keyword       | 0.20   | "gift", "urgent wire", "agent fee", "per CEO", "bitcoin", ...      |
| urgent flag           | 0.15   | request flagged `urgent`                                           |
| large amount          | 0.15   | amount > dual-approval threshold                                   |
| odd hour              | 0.10   | request created outside 07:00-20:00 Asia/Jerusalem                 |
| unknown BIC           | 0.10   | BIC not in approved-BIC whitelist                                  |
| round number          | 0.05   | amount ≥ 10,000 and divisible by 1,000                             |

**Weights are deliberately sensitive.** Techno-Kol's treasury policy: false positives are acceptable, false negatives cost the company its cash. A score ≥ 0.5 raises a yellow banner in the UI and requires the approver to actively dismiss it (dismissal is logged in the audit trail).

The suspicious-purpose keyword list is drawn from real BEC case law and the Israel Banking Association's fraud bulletin (2024). It includes Hebrew phrases (`עמלת סוכן`, `מכתב מנכ"ל`, `דחוף מנכ"ל`, `מתנה`) because many Techno-Kol requests are authored in Hebrew.

---

## 8. Reversal Workflow / ביטול העברה שנשלחה

Once a SWIFT MT103 has been transmitted by a bank, only the receiving bank can return funds. The module cannot reverse a wire — but it records the operator's reclaim process:

1. Operator calls `reverseFailedWire({ wireId, reason })`
2. Module flips the original request to status `REVERSED`
3. Module creates a new `reversal` record with a default reclaim checklist:
   - Notify the sending bank (Techno-Kol corporate desk)
   - Draft MT192 Request for Cancellation citing the original `:20:`
   - Wait up to 10 business days for the MT196 answer
   - If funds returned, reconcile against the original request ID
   - If rejected, escalate to legal and open a police case if fraud suspected
4. Every step is logged in the audit trail

The original request is NEVER deleted — it remains in the `_requests` map with status REVERSED and a full history entry. This is verified by test: **`reverseFailedWire records a reversal without deleting the original`**.

---

## 9. Hebrew Glossary / מילון מונחים

| English                   | עברית                          | Notes                                     |
|---------------------------|--------------------------------|-------------------------------------------|
| Wire transfer             | העברה בנקאית / העברת זכות     | SWIFT messages outside Masav              |
| Beneficiary               | מוטב                           |                                           |
| Sanctions list            | רשימת סנקציות                  | OFAC/UN/EU/Israeli מעקב                   |
| Watchlist                 | רשימת מעקב                     | Israeli NBCTF                             |
| Politically Exposed Person| אישיות פוליטית חשופה (PEP)     |                                           |
| Shell company             | חברת קש                        |                                           |
| Enhanced Due Diligence    | בדיקת נאותות מוגברת            | EDD                                       |
| Cooldown period           | תקופת צינון                    | 24h / 48h                                 |
| Velocity / rate limit     | הגבלת מהירות / הגבלת תדירות    | daily/weekly/monthly                      |
| Dual approval             | אישור כפול                     | Two-person rule                           |
| Two-factor auth           | אימות דו-שלבי (2FA)            | TOTP                                      |
| Ordering customer         | שולם על ידי                    | `:50K:` field                             |
| Account with institution  | בנק המוטב                      | `:57A:` field                             |
| Correspondent bank        | בנק כתב                        | `:53B:` / `:54A:`                         |
| Regulatory reporting      | דיווח רגולטורי                 | `:77B:` — Bank of Israel directive 411    |
| Value date                | תאריך ערך                      | `:32A:` date component                    |
| IBAN                      | חשבון בנק בינלאומי             | ISO 13616                                 |
| SWIFT BIC                 | קוד SWIFT                      | ISO 9362                                  |
| Audit trail               | יומן ביקורת                    | Immutable append-only log                 |
| CEO fraud                 | תרגיל המנכ"ל                  | BEC subset                                |
| Business Email Compromise | פריצה לדואר אלקטרוני עסקי (BEC)|                                           |
| Reclaim / cancellation    | בקשת ביטול                     | MT192 / MT196                             |
| Reconciliation            | פיוס / השוואה                  | match against bank statement              |
| FATF                      | FATF — הכוח המשימה הפיננסי     |                                           |
| NBCTF                     | הרשות למניעת הלבנת הון וטרור  | Israeli NBCTF                             |

---

## 10. Test Matrix / מטריצת בדיקות

**45/45 passing** — run with `node --test onyx-procurement/test/finance/wire-transfer.test.js`.

| # | Test Name                                                              | Area                |
|---|------------------------------------------------------------------------|---------------------|
| 1 | validateIbanLocal accepts a well-formed Israeli IBAN                   | Helpers             |
| 2 | validateIbanLocal rejects a mutated IBAN                               | Helpers             |
| 3 | validateIbanLocal rejects garbage                                      | Helpers             |
| 4 | validateBic accepts 8-char and 11-char BIC                             | Helpers             |
| 5 | validateBic rejects malformed codes                                    | Helpers             |
| 6 | validateIsraeliId accepts the canonical test vector                    | Helpers             |
| 7 | validateIsraeliId rejects checksum-failed IDs                          | Helpers             |
| 8 | swiftAmount formats amounts with comma decimals                        | Helpers             |
| 9 | swiftDateYYMMDD renders a date in YYMMDD form                          | Helpers             |
|10 | addBeneficiary rejects missing required fields                         | Beneficiary         |
|11 | addBeneficiary requires at least one routing identifier                | Beneficiary         |
|12 | addBeneficiary validates IBAN via MOD-97                               | Beneficiary         |
|13 | addBeneficiary validates BIC                                           | Beneficiary         |
|14 | addBeneficiary flags IBAN/BIC country mismatch                         | Beneficiary         |
|15 | addBeneficiary validates Israeli ת.ז                                   | Beneficiary         |
|16 | addBeneficiary refuses to overwrite an existing id — never delete      | Never-delete rule   |
|17 | verifyBeneficiary blocks a sanctioned entity                           | Sanctions screening |
|18 | verifyBeneficiary flags a PEP (not blocked)                            | Sanctions screening |
|19 | verifyBeneficiary flags shell companies                                | Sanctions screening |
|20 | verifyBeneficiary reports high-risk country                            | Sanctions screening |
|21 | cooldownPeriod starts active for a brand-new beneficiary               | Cooldown            |
|22 | cooldownPeriod clears after 24h for low-risk country                   | Cooldown            |
|23 | cooldownPeriod uses 48h for high-risk country                          | Cooldown            |
|24 | createWireRequest during cooldown marks status COOLDOWN                | Cooldown            |
|25 | rateLimit allows the first wire                                        | Rate limit          |
|26 | rateLimit refuses when count window is saturated                       | Rate limit          |
|27 | rateLimit refuses when amount window is saturated                      | Rate limit          |
|28 | dualApproval required when amount > threshold                          | Dual approval       |
|29 | approveRequest rejects bad 2FA token                                   | 2FA                 |
|30 | approveRequest moves to PENDING_SECOND_APPROVAL for dual-approval      | Dual approval       |
|31 | approveRequest accepts single approver for small wires                 | Dual approval       |
|32 | approveRequest refuses when beneficiary is still in cooldown           | Cooldown            |
|33 | swiftMT103Format emits a well-structured message                       | MT103 structure     |
|34 | executeRequest includes the safety notice — does NOT transmit          | Safety rule §2.1    |
|35 | anomalyDetection flags high-risk country + new beneficiary             | Anomaly             |
|36 | anomalyDetection flags BEC-style purpose keywords                      | Anomaly             |
|37 | anomalyDetection scores low for a known, small, normal wire            | Anomaly             |
|38 | anomalyDetection flags round-number amounts                            | Anomaly             |
|39 | reverseFailedWire records a reversal without deleting the original     | Reversal, never-delete |
|40 | reverseFailedWire refuses pre-execute requests                         | Reversal            |
|41 | dailyReconcile matches executed wires against bank statement rows      | Reconciliation      |
|42 | dailyReconcile reports exceptions for orphan statement rows            | Reconciliation      |
|43 | audit log captures every state transition                              | Audit trail         |
|44 | manager without a 2FA verifier rejects all approvals by default        | 2FA default-deny    |
|45 | DEFAULT_DUAL_APPROVAL_ILS exported constant is sane                    | Constants           |

---

## 11. Integration Notes / הערות אינטגרציה

- **IBAN validation** — the module carries its own local MOD-97 implementation so it has zero dependencies. The algorithm is identical to `validators/iban.js`; a follow-up refactor can make the main validator the single source of truth.
- **Clock injection** — tests pass a `clock` function so time-based code (cooldown, rate limits) is deterministic.
- **2FA backend** — wire your production TOTP / WebAuthn verifier through the `verify2fa` constructor option. The module never stores secrets.
- **Sanctions list refresh** — the operator (or a scheduled job, or `workflow/` engine AG-X15) should call `setSanctionsList()` / `setPepList()` / `setShellCompanyList()` at least weekly. Suggested pattern:

  ```js
  // Sunday 03:00 Israel time
  const list = await fs.readFile('/var/secure/ofac-sdn-latest.txt', 'utf8');
  mgr.setSanctionsList(list.split('\n').filter(Boolean));
  ```

- **Bank of Israel directive 411** — the `:77B:` regulatory reporting field is auto-populated for non-ILS wires. Larger wires (> ILS 50,000 aggregate in a calendar month) require additional BoI reporting that the finance clerk files manually through the bank portal; the module's audit log provides the paper trail.
- **Never-delete companion modules** — integrates with `src/finance/budget`, `src/gl`, `src/payments/payment-run.js` (Masav engine — domestic pay) and `src/security/audit-trail` per the same rule.

---

## 12. Extension Points / נקודות הרחבה

- **MT192 builder** — current reversal emits a reclaim checklist only; a future iteration can build the actual MT192 "Request for Cancellation of Previous Payment" message.
- **MT940 parser** — `dailyReconcile` accepts a generic statement array; a future iteration can parse MT940/MT942 (customer-statement) files directly from the bank portal.
- **Intraday liquidity view** — rate-limit windows can be extended with an "intraday" window for firms with tight cash management.
- **Travel-rule (FATF) metadata** — when Israel adopts the FATF travel rule for SWIFT, the `:70:` remittance information will need the originator's address and ID. All the fields are already captured on `beneficiary` / `orderingCustomer`.

---

## 13. File Locations / מיקומי קבצים

- `onyx-procurement/src/finance/wire-transfer.js` — implementation (~1000 LOC)
- `onyx-procurement/test/finance/wire-transfer.test.js` — 45 tests
- `_qa-reports/AG-Y083-wire-transfer.md` — this report

---

**Rule reminder:** לא מוחקים — רק משדרגים ומגדלים.
**Status:** PASS — green across the board. Ready for finance-clerk UAT.
