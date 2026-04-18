# AG-Y081 — Bank Signatory & Authorization Workflow

**Domain:** Techno-Kol Uzi — Finance / Treasury / Payments authorization
**Module:** `onyx-procurement/src/finance/signatory-workflow.js`
**Tests:** `onyx-procurement/test/finance/signatory-workflow.test.js`
**Rule:** לא מוחקים — רק משדרגים ומגדלים (never delete, only upgrade and grow)
**Status:** PASS — 41/41 tests green

---

## 0. Disclaimer (read first / חובה לקרוא קודם)

This module **stores the approval intent and signatures only**. It
**never** contacts a bank, **never** opens a SWIFT/MT103/FedWire/MASAV
channel, **never** initiates a transfer. After a request is fully
signed and verified, a human authorized signatory must take the
approved request and physically execute it through the bank's own
channel (branch, online banking, corporate portal, paper wire form,
מס"ב file drop, etc.).

מודול זה שומר את הכוונה לאישור ואת החתימות בלבד. אין בו ביצוע בפועל
מול הבנק. לאחר אישור מלא על מורשה חתימה להעביר פיזית את הבקשה דרך ערוץ
הבנק (סניף, בנקאות מקוונת, מסוף ארגוני, טופס נייר, קובץ מסב).

---

## 1. Purpose

Models the **approval chain** for outgoing bank transactions: wires,
checks, electronic payments (ACH / מס"ב), and pay-links. Enforces:

- Amount-tiered **signatory matrix** (1 / 2 / 2+CFO signers)
- **Segregation of Duties** — initiator can never approve
- **Dual control** on high-value wires (two signers physically present)
- **OFAC / sanctions / AML** compliance gate
- Cryptographic **integrity hash** on every signature
- Append-only **audit trail**
- **Timeout handling** — requests expire after a configurable window
- **Bilingual notifications** (Hebrew / English)

Zero npm dependencies — pure `node:crypto` + built-ins.

---

## 2. API Surface

| Method                                        | Purpose                                                              |
|-----------------------------------------------|----------------------------------------------------------------------|
| `defineSignatoryMatrix({accountId, rules})`   | Install / version an approval matrix per bank account                |
| `requestAuthorization(payload, initiator)`    | Open a new workflow, auto-route + auto-compliance                    |
| `routeForApproval(requestId)`                 | Pick tier + required roles based on matrix                           |
| `signRequest(requestId, signer, method)`      | Record a signature + integrity hash                                  |
| `verifySignatures(requestId)`                 | Completeness report (counts, must-include, integrity, dual control)  |
| `segregationOfDuties(request)`                | SoD gate — initiator cannot approve                                  |
| `dualControl(request)`                        | Dual-control gate — high-value wires need 2-person present           |
| `auditTrail(requestId)`                       | Append-only event log slice for one request                          |
| `expiredRequests(hours)`                      | Sweep + report expired pending requests                              |
| `complianceCheck(request)`                    | OFAC / sanctions / AML / high-value screen                           |
| `notifyApprovers(requestId)`                  | Emit bilingual notifications to the signer roles for the tier        |
| `rejectRequest(requestId, rejector, reason)`  | Terminate with reason; full audit entry                              |
| `markExecutedOffline(requestId, executor, bankRef)` | Record that a human executed the request through the bank channel  |

---

## 3. Default Signatory Matrix (תבנית ברירת מחדל)

Three canonical tiers, ILS-equivalent:

| Tier | Range (ILS)            | Signers | Required roles                                  | Must include      | Dual control | Window  |
|-----:|------------------------|--------:|--------------------------------------------------|-------------------|--------------|---------|
|   0  | up to 50,000           |       1 | finance_manager / controller / accountant       | —                 | no           | 48 h    |
|   1  | 50,000 – 500,000       |       2 | finance_manager / controller / cfo               | finance_manager   | no           | 48 h    |
|   2  | 500,000 and above      |       2 | cfo / ceo / board_member / finance_manager       | cfo               | **yes**      | 24 h    |

Override per bank account via `defineSignatoryMatrix` — callers can pass
any number of tiers, any role list, and any per-tier timeout. The
previous version is preserved under `matrix.history[]` so auditors can
replay "what matrix was in force when this request was approved."

### Matrix definition example (raw API)

```js
wf.defineSignatoryMatrix({
  accountId: 'ACC-HAPOALIM-MAIN',
  rules: [
    { amountRange: { min: 0,       max: 50_000  }, signersRequired: 1,
      signerRoles: ['finance_manager', 'controller'] },
    { amountRange: { min: 50_000,  max: 500_000 }, signersRequired: 2,
      signerRoles: ['finance_manager', 'cfo'],
      mustInclude: ['finance_manager'] },
    { amountRange: { min: 500_000, max: null    }, signersRequired: 2,
      signerRoles: ['cfo', 'ceo'],
      mustInclude: ['cfo'], dualControl: true, timeWindow: { hours: 24 } },
  ],
});
```

`amountRange.max: null` means "no upper bound" — internally normalized
to `Number.POSITIVE_INFINITY`.

---

## 4. Worked Flow Example

```
1. Carol (controller) initiates a 120,000 ILS wire to "Spot Welders Ltd":
     wf.requestAuthorization({
       transactionType: 'wire',
       amount: 120_000,
       currency: 'ILS',
       beneficiary: { name: 'Spot Welders Ltd', ... },
       purpose: 'May invoice settlement',
     }, { id: 'U-CAROL', name: 'Carol Mizrahi', role: 'controller' });

2. Matrix routes to TIER 1:
     → 2 signers required, must include finance_manager
     → dual control NOT required (amount < 500k)
     → 48h window

3. Carol CANNOT sign — SoD blocks initiator:
     signRequest(req.id, CAROL, 'digital')   → throws: SoD violation

4. Bob (finance_manager) signs:
     → mustInclude satisfied
     → signatures = 1/2 → status = partially_signed
     → integrity hash #1 stored

5. Dan (cfo) signs with 2fa:
     → signatures = 2/2, mustInclude ok, integrity ok, dualControl n/a
     → status = approved
     → audit entry 'request.approved'

6. Human treasurer takes the approved request + the generated bilingual
   PDF/email to the Bank Hapoalim portal and executes the wire.

7. Treasurer reports back:
     wf.markExecutedOffline(req.id,
        { id: 'U-TREAS', name: 'Treasurer Kobi' }, 'HP-REF-2026-04-11-0042');
     → status = executed_offline (terminal, never deleted)
```

---

## 5. Segregation of Duties (SoD)

Three levels of enforcement:

1. **Pre-signature gate** — `signRequest` refuses to record a signature
   from the same user that initiated the request. Emits
   `request.sod_violation` into the audit log and throws.
2. **Post-hoc audit** — `segregationOfDuties(request)` scans the
   `request.signatures` array and returns `{ ok: false, reason:
   'initiator_is_in_signers' }` if the initiator sneaked into the
   signer list through any back door.
3. **Role gate** — a signer whose role is not in the tier's
   `signerRoles` list is rejected with a `not permitted by tier N`
   error, even if they are otherwise a valid employee.

SoD reason codes (always bilingual):

| code                         | he                                                      | en                                               |
|------------------------------|---------------------------------------------------------|--------------------------------------------------|
| `initiator_cannot_approve`   | יוזם הבקשה לא יכול לאשר אותה בעצמו                       | The initiator cannot approve their own request    |
| `initiator_is_in_signers`    | יוזם הבקשה מופיע בין החותמים — פגיעה בהפרדת תפקידים      | Initiator appears in signer list — SoD violation  |

---

## 6. Dual Control

Forced when **any** of the following holds:

- Tier flag `dualControl: true` on the matching rule (default tier 2)
- `amountILS >= 500,000`
- `transactionType === 'wire'` and `amountILS >= 100,000`

Satisfaction rule:

- Both signers must have signed **within 15 minutes of each other**
  (logical "same room / same session"), **OR**
- Both signers used `method: 'physical'` (wet-ink on paper), which
  implies they were physically present in the same place.

If dual control is required but unsatisfied, `verifySignatures` returns
`complete: false` with reason `dual_control_not_colocated`, and the
request stays `partially_signed` until the second presence is recorded
(or the request expires).

---

## 7. Signature Integrity Hash

Every `signRequest` call records a SHA-256 hash computed from a
canonical JSON of:

```
{
  requestId, amount, currency, beneficiary,
  purpose, transactionType,
  priorSignatures: [...integrityHash of every earlier signature],
  signerId, method, ts,
}
```

`verifySignatures` replays every hash in order and compares to the
stored value. **Tampering anywhere in the request body after signing**
(changing the amount, swapping the beneficiary, appending a phantom
signature in the middle) flips the top-level `integrityOk` flag to
`false` and the whole request goes back to `complete: false`.

The `priorSignatures` chaining means signature #N's hash covers all
N-1 earlier hashes — this is a lightweight **hash chain** so you can
detect reordering of signatures, not just mutation of fields.

---

## 8. Compliance Gates

`complianceCheck` emits three types of hits:

| type             | when                                                     | effect                                          |
|------------------|----------------------------------------------------------|-------------------------------------------------|
| `sanctions`      | OFAC / SDN / Israeli&UN terms match the beneficiary text | **blocks** — request goes to `compliance_hold`, signing is refused |
| `aml_threshold`  | `amountILS >= 50,000`                                    | **review** — elevated reporting required        |
| `high_value_gate`| `amountILS >= 500,000`                                   | **review** — CFO sign-off + dual control        |

The seed `OFAC_BLOCKLIST` ships with demo terms (`OFAC-BLOCKED-DEMO`,
`SDN-SAMPLE`, and high-profile Israeli/UN-sanctioned terrorist group
names). Production callers should replace it via constructor option:

```js
const wf = new SignatoryWorkflow({ sanctionsList: fetchLiveOfacList() });
```

A `blocked` request can still be re-screened (re-create with corrected
beneficiary info) and can be rejected via `rejectRequest`, but the
original blocked record stays in place forever (never-delete).

### Compliance status bilingual

| code     | he                                  | en                               |
|----------|-------------------------------------|----------------------------------|
| `clear`  | עובר                                | Clear                            |
| `review` | נדרשת בדיקה — מעל סף AML / ערך גבוה | Review required — AML / high-value |
| `blocked`| חסום — פגיעה ברשימת סנקציות          | Blocked — sanctions list hit     |

---

## 9. Timeout & Expired Requests

Each request carries an `expiresAtTs` computed at creation from the
tier's `timeWindow.hours` (default 48 h). `expiredRequests(hours)`
sweeps all non-terminal requests and flips them to status `expired`
with an audit entry. A request that has already been `approved`,
`rejected`, or `executed_offline` is **never** swept — terminal status
is sticky.

`signRequest` also checks the deadline on every call: a request that
is signed past its `expiresAtTs` is marked `expired` and the signature
attempt is rejected with an error. The previously collected signatures
are preserved — nothing is deleted, the request just becomes unsigned
forever.

---

## 10. Audit Trail

Append-only `auditLog[]` — never spliced, never mutated. Every
mutating call pushes an entry shaped as:

```
{ action, requestId?|accountId?, ts, tsMs, ...details }
```

Actions emitted:

```
matrix.defined
request.created
request.routed
request.compliance_hold
request.signed
request.approved
request.partially_signed     (implicit via status flip, no row)
request.sod_violation
request.expired_on_sign
request.expired_sweep
request.rejected
request.executed_offline
request.notified
```

`auditTrail(requestId)` returns a filtered slice for a single request.
The full log is exposed on `wf.auditLog` for whole-tenant export.

---

## 11. Notifications (bilingual)

`notifyApprovers(requestId)` emits one message per distinct role on the
current tier's `signerRoles` list and pushes it into
`wf.notificationQueue` (consumed by any downstream email / Slack / SMS
adapter outside this module's scope). Every message has four fields:

- `subject_he`, `body_he` — Hebrew
- `subject_en`, `body_en` — English

The body includes the disclaimer string so every recipient is reminded
that execution is manual and happens outside the system.

---

## 12. Never-Delete Guarantees

| Action                              | How history is preserved                                          |
|-------------------------------------|-------------------------------------------------------------------|
| `defineSignatoryMatrix` (re-define) | Prior matrix pushed onto `matrix.history[]`, version bumped       |
| Expired request                     | Stays in `this.requests`, just flips status to `expired`          |
| Rejected request                    | `request.rejections[]` appended; status=rejected, never purged    |
| Compliance-blocked                  | Request kept in `compliance_hold`, original compliance hits kept  |
| Tampered request                    | `integrityOk` flag flips to `false` — detectable, not hidden      |
| Signatures                          | `request.signatures[]` is append-only; the hash chain detects reorder |
| Audit log                           | `this.auditLog[]` never spliced                                   |

No method in the module ever calls `Map.delete()`, `Array.prototype.splice`,
or shrinks any collection.

---

## 13. Hebrew Glossary (מילון מונחים)

| עברית                          | English                           | Notes                                       |
|--------------------------------|-----------------------------------|---------------------------------------------|
| מורשה חתימה                    | Authorized signatory              | Person with legal right to bind the company |
| מטריצת חתימות                  | Signatory matrix                  | Per-account tiered approval rules           |
| הפרדת תפקידים                  | Segregation of duties (SoD)       | Initiator ≠ approver                        |
| דואל-קונטרול / בקרה כפולה      | Dual control                      | Two people physically present               |
| חתימה דיגיטלית                 | Digital signature                 | Method = `digital`                          |
| אימות דו-שלבי                  | Two-factor authentication         | Method = `2fa`                              |
| טוקן חומרה                     | Hardware token                    | Method = `hardware-token`                   |
| חתימה פיזית                    | Physical (wet-ink) signature      | Method = `physical`                         |
| העברה בנקאית / וייר            | Wire transfer                     | Transaction type = `wire`                   |
| צ'ק                            | Check                             | Transaction type = `check`                  |
| העברה אלקטרונית / מסב          | Electronic / ACH / מס"ב           | Transaction type = `electronic`             |
| קישור תשלום                    | Pay link                          | Transaction type = `paylink`                |
| פקיד כספים                     | Finance clerk                     | Role = `clerk`                              |
| רואה חשבון                     | Accountant                        | Role = `accountant`                         |
| מנהל כספים                     | Finance manager                   | Role = `finance_manager`                    |
| חשב                            | Controller                        | Role = `controller`                         |
| סמנכ"ל כספים                   | CFO                               | Role = `cfo`                                |
| מנכ"ל                          | CEO                               | Role = `ceo`                                |
| חבר דירקטוריון                 | Board member                      | Role = `board_member`                       |
| מוטב                           | Beneficiary                       | Destination of the transfer                 |
| יוזם                           | Initiator                         | Person who opened the request               |
| רשימת סנקציות / OFAC           | Sanctions list / OFAC             | Compliance gate                             |
| הלבנת הון                      | Money laundering / AML            | Compliance gate                             |
| סף דיווח                       | Reporting threshold               | 50,000 ILS default                          |
| ערך גבוה                       | High value                        | 500,000 ILS default                         |
| זמן תפוגה / חלון זמן           | Timeout / time window             | Default 48h, high-value 24h                 |
| יומן ביקורת                    | Audit trail                       | Append-only                                 |
| גיבוב תקינות / hash תקינות     | Integrity hash                    | SHA-256 hash chain                          |
| השעיה לציות                    | Compliance hold                   | Status after sanctions hit                  |
| בוצע ידנית / מחוץ למערכת       | Executed offline                  | Terminal status after human bank execution  |
| הצהרת אחריות                   | Disclaimer                        | Attached to every request and every email   |

---

## 14. Integration Notes

- **Zero dependencies** — only `node:crypto`, runs on the same Node
  version as the rest of `onyx-procurement`.
- **Does NOT call the bank.** This is the loud rule — the module has
  no network I/O at all.
- Hooks cleanly into the rest of the stack:
  - `src/auth/audit-trail` collector can ship `wf.auditLog` downstream.
  - `src/notifications/*` adapters can drain `wf.notificationQueue`.
  - `src/compliance/ofac-list` (if/when added) replaces the seed
    `OFAC_BLOCKLIST` via `new SignatoryWorkflow({ sanctionsList })`.
  - `src/cash/payment-run` can open requests via `requestAuthorization`
    before it builds the batch — once approved it hands off to a human
    for the actual bank upload.
- **Hebrew strings are UTF-8 literals** — consumers must render RTL
  where shown to users.
- **Clock injection.** The constructor accepts `{ clock: () => ms }` so
  tests can drive deterministic timeouts without faking `Date.now`.

---

## 15. Test Coverage (41/41 PASS)

```
defineSignatoryMatrix
  ✓ accepts a valid 3-tier matrix and normalizes ranges
  ✓ rejects unknown roles
  ✓ rejects min >= max
  ✓ re-defining preserves history (never-delete)

routeForApproval (tiered matrix routing)
  ✓ tier 0: <=50k -> 1 signer
  ✓ tier 1: 50k-500k -> 2 signers incl. finance_manager
  ✓ tier 2: >500k -> 2 signers incl. CFO + dual control
  ✓ explicit matrix overrides the default

segregationOfDuties (SoD)
  ✓ initiator cannot sign their own request
  ✓ a different finance_manager can sign
  ✓ direct SoD audit catches initiator in signer list

signRequest + verifySignatures
  ✓ single-signer tier: 1 signature -> approved
  ✓ two-signer tier: 1 of 2 -> partially_signed, 2 of 2 -> approved
  ✓ mustInclude enforcement: tier 1 without finance_manager is incomplete
  ✓ disallowed role is rejected
  ✓ duplicate signer blocked
  ✓ integrity hash detects tampering of amount after signing

dualControl enforcement
  ✓ high-value wire triggers dual control
  ✓ small wire does NOT trigger dual control
  ✓ dual-control request is NOT complete when signers are far apart
  ✓ dual-control satisfied when both sign within 15 min
  ✓ dual-control satisfied when both use physical (wet-ink) method

expiredRequests (timeout handling)
  ✓ request expires after the 48h window
  ✓ approved request is never swept as expired
  ✓ signing past the deadline throws and marks expired

complianceCheck
  ✓ clear when below AML threshold and no sanctions hit
  ✓ review when above AML threshold
  ✓ high-value gate fires above 500k
  ✓ OFAC hit blocks the request
  ✓ cannot sign a blocked request

auditTrail
  ✓ records created / routed / signed / approved
  ✓ audit trail is append-only — older entries preserved after rejection
  ✓ SoD violation is logged

notifyApprovers (bilingual)
  ✓ emits one message per role in the tier
  ✓ notifications are queued for downstream channels

catalogs + disclaimer
  ✓ TRANSACTION_TYPES exposes the 4 canonical channels
  ✓ SIGNER_ROLES covers clerk -> board_member
  ✓ SIGNATURE_METHODS: digital / 2fa / hardware-token / physical
  ✓ DEFAULT_MATRIX_RULES have three tiers
  ✓ OFAC_BLOCKLIST is non-empty
  ✓ disclaimer is exposed on every request

tests 41
suites 10
pass  41
fail  0
```

---

**Report produced:** 2026-04-11
**Agent:** Y-081
**Never delete. Only grow.** (לא מוחקים — רק משדרגים ומגדלים)
