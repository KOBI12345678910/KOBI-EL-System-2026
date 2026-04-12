# AG-X28 — RFQ Workflow (Procurement)

**Agent:** X-28  
**Swarm:** 3B  
**System:** Techno-Kol Uzi mega-ERP 2026  
**Date:** 2026-04-11  
**Status:** PASS — 26/26 tests green (target was 15+)  
**Constraint mode:** Never delete, Hebrew RTL bilingual, zero deps

---

## 1. Scope

Deliver a complete Request-For-Quote (RFQ) procurement workflow for the
Techno-Kol Uzi ERP. The module must:

1. Let a buyer build an RFQ with one or more line items.
2. Send time-boxed, unique-token invitations to selected suppliers.
3. Accept blind bids back from suppliers (no login, token = auth).
4. Enforce a bid deadline and minimum-bid compliance for public sector.
5. Produce a side-by-side comparison matrix.
6. Score bids on price / delivery / quality / payment terms with
   configurable weights.
7. Award the winning bid and produce a downstream PO record.
8. Preserve a full audit trail, and *never* delete data (archive-only).

---

## 2. Files delivered

| Path | Purpose | LOC |
|------|---------|-----|
| `onyx-procurement/src/rfq/rfq-engine.js` | RFQ state machine, scoring, Q&A, audit trail, in-memory store, email stub | ~780 |
| `payroll-autonomous/src/components/RfqComparison.jsx` | Hebrew RTL comparison matrix UI with editable weights, best-price highlighting, winner badge | ~580 |
| `test/payroll/rfq-engine.test.js` | `node --test` suite, 26 cases | ~480 |
| `_qa-reports/AG-X28-rfq-workflow.md` | This report | — |

All files are pure vanilla JavaScript / JSX. Zero external dependencies
outside `node:crypto` (stdlib) and React (already part of the payroll
application).

---

## 3. Architecture

### 3.1 State machine

```
 DRAFT ──► INVITED ──► OPEN ──► CLOSED ──► SCORED ──► AWARDED
   │          │         │         │          │           │
   └──────────┴─────────┴─────────┴──────────┴──────► ARCHIVED
```

Every transition is guarded by a `LEGAL_TRANSITIONS` map. Illegal
transitions throw before any mutation is applied. Every accepted
transition is written to the audit log with `action = state:FROM->TO`.

### 3.2 Data model (in-memory adapter)

```
rfq            : { id, title, titleEn, state, currency, lineItems[],
                   attachments[], deadline, minBids, publicSector,
                   legalFlags[], revisionRound, createdBy, createdAt,
                   updatedAt, awardedBidId, awardedPoId, archivedAt }

line_item      : { id, index, description, spec, quantity, unit,
                   target_delivery, currency, notes }

invitation     : { id, rfqId, supplierId, supplierEmail, token, url,
                   sentAt, status }

bid            : { id, rfqId, invitationId, supplierId, supplierName,
                   currency, lines[], totalPrice, deliveryDays,
                   qualityScore, paymentTermsDays, attachments[],
                   notes, round, superseded, supersededAt, submittedAt }

qa_entry       : { id, rfqId, question, askedBy, askedAt,
                   answer, answeredBy, answeredAt }

audit_event    : { id, rfqId, action, actor, at, details }

purchase_order : { id, rfqId, bidId, supplierId, currency, lines[],
                   total, deliveryDays, paymentTermsDays,
                   status, issuedAt, issuedBy }
```

The storage adapter is pluggable — an on-disk, SQL, or Supabase
implementation can drop in by conforming to the same shape.

### 3.3 Tokens

`genToken()` uses `crypto.randomBytes(32)` → 256-bit URL-safe base64.
Each supplier invitation gets its own token; the token *is* the auth for
`submitBid`. Reinviting an already-invited supplier returns the existing
invitation — we don't rotate tokens silently.

### 3.4 Revisions (never delete)

`submitBid(token, …)` inspects the existing bids for that supplier and
marks any active bid `superseded = true` with a `supersededAt`
timestamp, then writes the new bid as a fresh record. The full history
is still queryable by auditors; `scoreBids` and
`buildComparisonMatrix` filter `!b.superseded`.

### 3.5 Scoring math

```
score_total = w.price        * sP
            + w.delivery     * sD
            + w.quality      * sQ
            + w.paymentTerms * sT
```

- `sP` — lower total price is better: `100 * (1 - (p-min)/(max-min))`
- `sD` — lower delivery days is better
- `sQ` — supplier-declared 0..100, clamped
- `sT` — longer buyer payment terms is better (cash-flow positive)

Weights are normalized to sum to 1 before use, so a buyer can hand in
any percentages and still get a consistent ranking. When there is a
single bid (or all bids share a metric) the component defaults to 100
to avoid divide-by-zero.

### 3.6 Q&A broadcast

Questions are routed through `qaAddQuestion`. Answers go through
`qaAnswer(rfqId, questionId, answer, actor)` which:

1. Writes the answer to the Q&A record.
2. Emits an email to every invitation on the RFQ, including the
   question *without* revealing who asked it. This keeps the playing
   field level — a compliance hard-rule in public-sector tenders.

### 3.7 Public-sector compliance

`publicSector: true` sets `legalFlags = ['חוק חובת מכרזים', 'Public
Procurement Law']` and:

- `inviteSuppliers` refuses to send less than `minBids` invitations.
- `closeRfq` tags the RFQ with an `Insufficient bids: X/Y` flag when it
  would otherwise be closed below the minimum, and records a
  `compliance:insufficient_bids` audit event. The engine does not
  auto-cancel — it leaves the decision to the buyer while making the
  compliance gap visible.

---

## 4. Public API

```js
const { createRfqEngine } = require('./rfq-engine');
const engine = createRfqEngine();

// 1. Create
const rfqId = engine.createRfq({ title, lineItems, currency, deadline,
                                  publicSector, minBids }, 'buyer-01');

// 2. Invite
const invs = await engine.inviteSuppliers(rfqId,
              ['sup-acme', 'sup-pioneer', 'sup-delta'], 'buyer-01');

// 3. Supplier submits via token (no login)
const bidId = engine.submitBid(invs[0].token, {
  supplierName: 'Acme',
  lines: [{ unitPrice: 12.5 }, { unitPrice: 40 }],
  deliveryDays: 18, qualityScore: 90, paymentTermsDays: 45,
});

// 4. Q&A
const qId = engine.qaAddQuestion(rfqId, invs[1].token, 'תקן 61?');
await engine.qaAnswer(rfqId, qId, 'נדרש אישור סקור', 'buyer-01');

// 5. Close → Score → Award
engine.closeRfq(rfqId, 'buyer-01');
const ranked = engine.scoreBids(rfqId, {
  price: 0.5, delivery: 0.2, quality: 0.2, paymentTerms: 0.1,
});
const { poId } = engine.awardRfq(rfqId, ranked[0].bidId, 'buyer-01');

// 6. Archive (preserves data)
engine.archiveRfq(rfqId, 'buyer-01');

// Audit trail is available at any time
const audit = engine.getAuditTrail(rfqId);
```

Module-level convenience wrappers (`createRfq`, `inviteSuppliers`,
`submitBid`, `closeRfq`, `scoreBids`, `awardRfq`, `qaAddQuestion`,
`qaAnswer`) call into a lazy singleton engine for callers that don't
need to hold the engine handle themselves.

---

## 5. UI — RfqComparison.jsx

Hebrew RTL matrix aligned to the existing Palantir dark theme
(`#0b0d10 / #13171c / #4a9eff`) used by `AuditTrail.jsx` and
`BIDashboard.jsx`. Features:

- **Header:** bilingual title (HE primary + EN subtitle), state badge
  (`DRAFT → ARCHIVED`), RFQ title.
- **Editable weights panel:** four numeric percentage inputs (price,
  delivery, quality, payment terms) with live normalization. Emits
  `onWeightsChange(weights)`.
- **Matrix table:** rows = line items, columns = suppliers. Each
  cell shows the unit price and computed line total. The best price
  per row is highlighted in gold (`#ffd76a`).
- **Totals row:** per-supplier total price, delivery days, quality
  score, payment terms, and (when `scores` is passed in) the
  weighted score with a ★ for rank 1.
- **Winner badge:** ★ זוכה shown next to the awarded supplier.
- **Clickable totals cells:** selecting a supplier enables the
  Award button. Buyer clicks Award → `onAward(bidId)`.
- **Actions:** Export-to-PDF, Close-RFQ, Award — each guarded by
  state (e.g. Close is only shown in OPEN).
- **Accessibility:** `dir="rtl"`, ARIA labels on every button and
  status element, proper `role="table"`, `aria-selected` on the
  selected totals cell.
- **Empty / loading states:** isolated paths with helpful Hebrew copy.

Zero external UI libraries — everything is inline styles and pure
React functional components. Works under any React 17+ runtime.

---

## 6. Test results

```
$ node --test test/payroll/rfq-engine.test.js

ℹ tests 26
ℹ pass  26
ℹ fail   0
ℹ duration_ms ≈160
```

### 6.1 Test inventory (26 cases)

| # | Test | Area |
|---|------|------|
| 1 | createRfq creates RFQ in DRAFT state with line items | Creation |
| 2 | createRfq rejects missing title | Validation |
| 3 | createRfq rejects empty line items | Validation |
| 4 | createRfq rejects negative quantity | Validation |
| 5 | createRfq rejects unsupported currency | Validation |
| 6 | createRfq public sector sets legal flags (חוק חובת מכרזים) | Compliance |
| 7 | inviteSuppliers generates unique tokens and sends emails | Invitation |
| 8 | inviteSuppliers transitions DRAFT → OPEN after send | State machine |
| 9 | inviteSuppliers public-sector requires minBids invitees | Compliance |
| 10 | submitBid accepts valid bid via token (no login) | Bidding |
| 11 | submitBid rejects invalid token | Security |
| 12 | submitBid enforces deadline — rejects past deadlines | Deadline |
| 13 | submitBid revisions supersede — nothing is deleted | Never-delete |
| 14 | closeRfq transitions OPEN → CLOSED and blocks further bids | State machine |
| 15 | closeRfq flags public-sector RFQ closed with < minBids | Compliance |
| 16 | scoreBids computes weighted scores and ranks correctly | Scoring |
| 17 | scoreBids normalizes arbitrary weight totals | Scoring |
| 18 | awardRfq transitions SCORED → AWARDED and produces PO | Award |
| 19 | state machine: cannot award directly from DRAFT | State machine |
| 20 | getSupplierView: supplier cannot see other suppliers' data | Blind bidding |
| 21 | qaAnswer broadcasts to all invited suppliers | Q&A |
| 22 | buildComparisonMatrix flags bestPrice per line | Comparison |
| 23 | archiveRfq flips state without deleting data | Never-delete |
| 24 | audit trail records every lifecycle event | Audit |
| 25 | submitBid rejects bid with mismatched line count | Validation |
| 26 | scoreBids handles single-bid case without divide-by-zero | Scoring edge |

All 26 tests pass. Target was 15+.

---

## 7. Compliance checklist

| Requirement | Status |
|-------------|--------|
| Never delete data (supersede + archive only) | PASS |
| Hebrew RTL, bilingual labels (HE primary + EN secondary) | PASS |
| Zero external dependencies (only `node:crypto` + React) | PASS |
| Line items with spec, quantity, target_delivery, currency | PASS |
| >= 3 suppliers recommended (enforced in public-sector mode) | PASS |
| Unique token per supplier + email stub with link | PASS |
| Suppliers submit bids without login | PASS |
| Bid deadline enforcement | PASS |
| Side-by-side matrix view | PASS |
| Automated weighted scoring (price / delivery / quality / payment) | PASS |
| Blind bidding (supplier view isolation) | PASS |
| Q&A broadcast to all bidders | PASS |
| Revision rounds (prior bid superseded, not overwritten) | PASS |
| Attachment references (drawings, specs) | PASS |
| Legal compliance flags (חוק חובת מכרזים) | PASS |
| Award → creates PO | PASS |
| Archive with full audit trail | PASS |
| 15+ automated tests | PASS (26) |

---

## 8. Known limitations / future work

- **Email delivery** is an in-memory stub. Production should replace
  `createEmailStub()` with the SMTP client used by
  `onyx-procurement/src/emails/send-email.js`.
- **Storage** is in-memory. A Supabase or PostgreSQL adapter can be
  plugged in via the same interface.
- **PDF export** on the comparison UI is wired as a callback prop and
  expected to delegate to the existing server-side PDF pipeline.
- **Attachment uploads** store references only — the upload flow lives
  in the existing `src/emails/previews` and `src/imports` subsystems.
- **Multi-currency FX** — currency is recorded per line/bid but no FX
  normalization is performed during scoring. When bids arrive in
  different currencies, the buyer is responsible for converting before
  scoring (flagged in the TODO of `scoreBids`).

---

## 9. Smoke-test commands

```bash
# Run the engine tests
node --test test/payroll/rfq-engine.test.js

# Inspect exports
node -e "console.log(Object.keys(require('./onyx-procurement/src/rfq/rfq-engine')))"
```

---

**Sign-off:** Agent X-28, 2026-04-11.
RFQ workflow module is ready to integrate into the ONYX procurement
pipeline.
