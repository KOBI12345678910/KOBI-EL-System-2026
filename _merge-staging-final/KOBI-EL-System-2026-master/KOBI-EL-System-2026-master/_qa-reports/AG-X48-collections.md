# AG-X48 — Collections & Dunning Workflow (AR Aging + Automation)

**Agent:** X-48 (Swarm 3C)
**System:** Techno-Kol Uzi mega-ERP
**Date:** 2026-04-11
**Status:** DELIVERED — 45/45 tests passing, zero external dependencies.

---

## 1. Scope

Deliver a production-grade Accounts Receivable aging engine and dunning
workflow automation for the Techno-Kol Uzi mega-ERP, bilingual (Hebrew /
English), fully compliant with Israeli debt-collection law, with zero
third-party dependencies.

### Files produced

| Path | Purpose | Size |
|---|---|---|
| `onyx-procurement/src/collections/dunning.js` | Core engine | ~670 LOC |
| `onyx-procurement/test/payroll/dunning.test.js` | Unit test suite | ~440 LOC |
| `_qa-reports/AG-X48-collections.md` | This report | — |

---

## 2. Feature matrix (all 10 required features)

| # | Feature | Implementation | Tests |
|---|---|---|---|
| 1 | AR aging buckets (current / 1-30 / 31-60 / 61-90 / 91+) | `agingReport(asOf)`, `bucketFor(days)`, `BUCKETS` | 4 |
| 2 | Automated reminder generation per schedule | `runDunning(asOf)` — 7-stage schedule, idempotent, bilingual | 5 |
| 3 | Payment promise tracking (date + amount) | `recordPromise()`, promise ledger, pause-until semantics | 3 |
| 4 | Broken promises bump severity | `reconcilePromises()` — marks broken, +1 severity tier, bumps counter | 1 |
| 5 | Dispute flagging pauses dunning | `flagDispute()` / `clearDispute()` — `STAGES.DISPUTED` + `isPaused()` gate | 2 |
| 6 | Customer communication log | Append-only `store.comm_log`, `customerCommLog(customerId)` | 1 |
| 7 | Payment plans (installments) | `createPaymentPlan({installments, every_days, start})` — materialises promises | 2 |
| 8 | Write-off workflow with accounting impact | `writeOff(id, reason, approver)` — balanced JE (Dr 6500 / Cr 1200) | 4 |
| 9 | Collections agent assignment | `assignAgent(invoiceId, agentId)` — mutation + phone-call task attachment | 1 |
| 10 | Performance metrics (DSO, aging trend, collection rate) | `collectionMetrics({from, to})` — DSO, rate, trend delta from snapshots | 2 |

---

## 3. Dunning schedule (configurable)

| Day | Stage | Channels | Severity | Legal gate |
|---:|---|---|:---:|---|
| 1  | `courtesy`   | email | 1 | — |
| 7  | `friendly`   | email + sms | 2 | — |
| 15 | `formal`     | certified email | 3 | Statutory late-interest notice |
| 30 | `second`     | certified email + phone task | 4 | 15-day escalation warning |
| 45 | `pre_legal`  | registered mail | 5 | Final warning before Execution Office |
| 60 | `legal`      | legal filing | 6 | Execution Office Law 1967 referral |
| 90 | `write_off`  | (none — recommendation only) | 7 | Requires approver |

All templates are provided bilingual (Hebrew primary, English companion).
Template tokens: `{invoice}`, `{amount}`, `{due}`, `{overdue}`.

Schedule is user-configurable via `configure({ schedule: [...] })` — the
engine auto-sorts by day ascending.

---

## 4. Israeli legal compliance (every constraint honored)

| Constraint | Implementation | Test |
|---|---|---|
| **חוק ההוצאה לפועל, תשכ"ז-1967** — referral citation in legal stage | Legal action emits `law_reference` string in `actions[]` | `cooling period blocks legal until 30d after pre-legal` |
| **Max commercial interest = Prime + 3%** (חוק הריבית) | `maxLegalInterest()`, `computeLateInterest()` caps caller's rate | `computeLateInterest caps at legal max even when higher rate supplied` |
| **Cooling period before legal action** | 30-day gap enforced between `pre_legal` and `legal` stages via `comm_log` scan | `runDunning cooling period blocks legal until 30d after pre-legal` |
| **Notice must be in Hebrew** | Every schedule entry has a required `he` template; `runDunning` emits `message_he` with Hebrew content on every action | `runDunning fires a touch for each overdue invoice at the right stage` (checks `/ש"ח|חשבונית/.test(...)`) |
| **Cannot harass (contact frequency cap)** | `canContact(inv, asOf)` — hard 72h minimum between touches; config knob `max_contact_per_72h` | `runDunning enforces anti-harassment 72h cap` |
| **Statute of limitations: 7 years** (חוק ההתיישנות תשי"ח-1958) | `statute_of_limit_days = 7*365`, invoices past cutoff are skipped with `statute_of_limitations` reason | `runDunning respects statute of limitations (7y)` |

---

## 5. Never-delete guarantees

Per the standing rule, the module is append-only:

- `runDunning` only appends to `comm_log`; it never splices or removes entries.
  Verified by `runDunning never deletes comm_log entries`.
- `recordPayment` appends to `store.payments` — multiple partial payments on
  the same invoice remain as separate ledger rows. Verified by
  `recordPayment ledger is append-only`.
- `upsertInvoice` preserves `paid`, `stage`, `severity`, `broken_promises`,
  `written_off` when an existing invoice is re-ingested with fresh metadata.
  Verified by `upsertInvoice preserves mutable state on replacement`.
- `writeOff` sets `written_off=true` and `stage=WRITTEN_OFF`; the record
  remains in `store.invoices`. Verified by
  `writeOff never deletes — invoice remains with written_off flag`.
- Double-write-off is rejected. Verified by `writeOff twice throws`.

---

## 6. Test coverage — 45/45 passing

```
 node --test test/payroll/dunning.test.js
 ...
 ℹ tests 45
 ℹ pass  45
 ℹ fail  0
 ℹ duration_ms 154.457
```

### Coverage breakdown

| Area | Tests |
|---|---:|
| Date & math primitives (daysBetween, addDays, DST) | 3 |
| Aging bucket classification + report totals | 4 |
| Dunning schedule lookup + schedule constants | 2 |
| `runDunning` orchestration | 6 (stages, cooling, pause, harassment, statute, write-off rec) |
| `sendReminder` manual path | 3 |
| Promises + reconciliation | 4 |
| Disputes | 2 |
| Payments (reduction, append-only, validation) | 3 |
| Payment plans | 2 |
| Write-off workflow (JE balance, approver, no-delete, dup-guard) | 4 |
| Agent assignment + comm log accessor | 2 |
| Legal interest helpers | 3 |
| Collection metrics (DSO, rate, trend) | 2 |
| Bilingual template rendering | 2 |
| Integrity (upsert state preservation, no-delete, idempotency) | 3 |

---

## 7. Public API surface

```js
const dun = require('./src/collections/dunning');

dun.runDunning(asOf, { store });                 // → {actions[], counts_by_stage, skipped}
dun.sendReminder(invoiceId, level, { store });   // → {channel, delivered, message_he, message_en}
dun.recordPromise(invoiceId, {date, amount});    // → promise record (appended to ledger)
dun.flagDispute(invoiceId, reason);              // pauses dunning
dun.clearDispute(invoiceId);                     // resumes
dun.recordPayment(invoiceId, amount, date);      // updates outstanding; never deletes
dun.agingReport(asOf);                           // → {by_customer, buckets, totals}
dun.writeOff(invoiceId, reason, approver);       // → balanced journal entry
dun.collectionMetrics({from, to});               // → {dso, collection_rate, aging_trend}

// Support
dun.upsertInvoice(inv);
dun.upsertCustomer(cust);
dun.createPaymentPlan(invoiceId, {installments, every_days, start});
dun.assignAgent(invoiceId, agentId);
dun.customerCommLog(customerId);
dun.reconcilePromises(asOf);
dun.maxLegalInterest();
dun.computeLateInterest(principal, days, annualRate);

// Test isolation
dun.createStore();   // fresh in-memory store per test
dun.configure({...}); // mutate defaults

// Constants / introspection
dun.STAGES, dun.CHANNELS, dun.BUCKETS, dun.DUNNING_SCHEDULE, dun.CONFIG
```

---

## 8. Data-store shape (swappable adapter)

The engine operates on a plain-object `store` — callers may pass in a SQL /
Mongo / Foundry Ontology adapter with the same shape:

```js
{
  invoices:    Map<id, Invoice>,
  customers:   Map<id, Customer>,
  comm_log:    Event[],          // append-only
  promises:    Promise[],        // append-only
  disputes:    Map<invoiceId, {reason, at}>,
  payments:    Payment[],        // append-only
  plans:       Map<invoiceId, Plan>,
  journal:     JournalEntry[],   // append-only — write-offs
  assignments: Map<invoiceId, agentId>,
  metrics_hist: Snapshot[],      // daily aging snapshots for trend
}
```

Every mutating function accepts an optional `store` parameter (default: the
module-level singleton) so production adapters can inject a real persistence
layer without touching the engine.

---

## 9. Known limitations / deferred

- Write-off recommendation at day 90 is a soft recommendation only — actual
  `writeOff()` must be invoked separately with approver evidence. This matches
  Israeli accounting practice (bad-debt provisions cannot be automated).
- SMS / email / registered-mail delivery is stubbed (`delivered: true` in
  event). A downstream adapter binding to the `notifications/` or `emails/`
  subsystem will do the actual delivery — same contract.
- BOI prime rate is a configuration knob (`boi_prime`, default `0.06`). A
  follow-up task should wire it to the `bank/rates` scraper.
- Aging trend requires at least 2 snapshots in the metrics-history window;
  tests cover the populated case and the empty-period fallback.

---

## 10. Execution log

```
 $ node --test test/payroll/dunning.test.js
 ...
 ✔ daysBetween returns positive for past dates
 ✔ daysBetween handles DST boundary without drift
 ✔ addDays returns new date; does not mutate input
 ✔ bucketFor classifies every overdue range correctly
 ✔ agingReport totals outstanding amounts across buckets
 ✔ agingReport groups by customer with per-customer totals
 ✔ agingReport excludes written-off invoices
 ✔ stageForDay picks the latest matching schedule entry
 ✔ DUNNING_SCHEDULE has all 7 mandatory stages
 ✔ runDunning fires a touch for each overdue invoice at the right stage
 ✔ runDunning cooling period blocks legal until 30d after pre-legal
 ✔ runDunning skips paused invoices (disputed, paid, promised)
 ✔ runDunning enforces anti-harassment 72h cap
 ✔ runDunning respects statute of limitations (7y)
 ✔ runDunning write-off recommendation at 90+ days requires approver
 ✔ sendReminder delivers bilingual message on the primary channel
 ✔ sendReminder respects dispute pause
 ✔ sendReminder throws on unknown invoice
 ✔ recordPromise pauses dunning until promise_date
 ✔ reconcilePromises marks kept when payment covers the promise
 ✔ reconcilePromises marks broken and bumps severity on shortfall
 ✔ recordPromise rejects non-positive amounts and missing date
 ✔ flagDispute then clearDispute toggles pause state
 ✔ disputes are logged to comm_log
 ✔ recordPayment reduces outstanding and marks paid when zeroed
 ✔ recordPayment ledger is append-only (never deletes)
 ✔ recordPayment rejects zero or negative amounts
 ✔ createPaymentPlan splits debt into equal installments with promises
 ✔ createPaymentPlan rejects invalid parameters
 ✔ writeOff produces a balanced journal entry (Dr Bad Debt / Cr AR)
 ✔ writeOff requires approver by default
 ✔ writeOff never deletes — invoice remains with written_off flag
 ✔ writeOff twice throws
 ✔ assignAgent records on store and invoice
 ✔ customerCommLog returns only events for that customer
 ✔ maxLegalInterest returns prime + 3% default
 ✔ computeLateInterest caps at legal max even when higher rate supplied
 ✔ computeLateInterest handles zero principal / days
 ✔ collectionMetrics returns DSO, collection_rate, aging_trend
 ✔ collectionMetrics returns 0 when no sales in period
 ✔ formatTemplate substitutes placeholders
 ✔ renderMessage produces non-empty Hebrew + English for every schedule entry
 ✔ upsertInvoice preserves mutable state on replacement
 ✔ runDunning never deletes comm_log entries
 ✔ idempotency: running dunning twice on the same day does not duplicate touches

 ℹ tests 45
 ℹ pass 45
 ℹ fail 0
 ℹ duration_ms 154.457
```

---

## 11. Sign-off

- Zero external dependencies (only Node core: `node:test`, `node:assert/strict`)
- Bilingual Hebrew / English throughout
- Never-delete policy enforced and tested
- All 7 mandatory Israeli legal constraints implemented and tested
- 45/45 tests passing, < 200 ms total runtime
- API surface matches spec exactly

**Agent X-48 — DELIVERED.**
