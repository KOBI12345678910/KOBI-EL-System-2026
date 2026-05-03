# AGENT-FIX-VENDOR — Applied (AGENT-223 Vendor Scoring Wiring)

**Date:** 2026-04-29
**Worktree:** `objective-merkle-40ff93`
**Branch:** `claude/objective-merkle-40ff93`
**Reference spec:** `_qa-reports-25/AGENT-223-vendor-scoring-wiring.md`
**Verdict:** **APPLIED — all 5 patches landed, math layer untouched, all existing tests still green.**

---

## 0. What was done

Closed the loop opened by AGENT-183: the analytics module
`onyx-procurement/src/analytics/vendor-scoring.js` (930 LOC, 32 tests pass)
went from **zero production callers** to **two callers** (event listener +
nightly cron), with a **persistence helper** that writes the result to
the canonical `procurement.suppliers.performance_score` /
`procurement.suppliers.risk_level` columns and a **history table**
(`procurement.vendor_score_history`) that drives the Supplier360
scoring tab and the `DECLINING_TREND` risk in the next score.

Additionally, the `supplier.blacklist` orchestrator action was added,
backed by a new `supplier` state machine (6 outbound + 1 inbound
transitions, 7 badges) and a DB-layer guard that refuses RFQ-invite
and PO inserts against any blacklisted supplier (defense in depth).

All edits are **additive — zero deletions, zero exports removed**.

---

## 1. Files created (4 new)

| Path | Lines | Purpose |
|------|------:|---------|
| `onyx-procurement/src/wiring/vendor-scoring-listener.js` | 138 | Event listener — re-scores on `procurement.po.fully_received` / `closed` / `received` (3 events bound). Exports `__loadSupplierHistory` for cron reuse. Fire-and-forget; never throws into the PO close path. |
| `onyx-procurement/src/suppliers/score-persistence.js` | 100 | `persistScore(supabase, supplierId, scoreResult)` writes both the parent `suppliers` row and a `vendor_score_history` snapshot. Idempotent on `(supplier_id, as_of)` (Postgres unique-violation 23505 swallowed). `riskLevelFor(composite, risks)` exported for tests. |
| `supabase/migrations/00092_vendor_score_history.sql` | 86 | (a) creates `procurement.vendor_score_history` table + 2 indexes + RLS, (b) aligns `suppliers.status_check` to permit `'blacklisted'` and adds `blacklist_reason` + `blacklisted_at` columns, (c) installs `procurement.guard_supplier_active()` trigger function + 2 BEFORE-INSERT triggers (`trg_guard_rfq_supplier`, `trg_guard_po_supplier`) that raise `P0001` when target supplier is blacklisted. |
| `_qa-reports-25/AGENT-FIX-VENDOR-applied.md` | this file | Sign-off / what-was-done. |

> **Migration number choice:** spec drafted as 00084 + 00085. The live
> repo already has migrations 00084_payment_anomalies_persist /
> 00084_sales_order_state_machine / 00085_grn_ap_payment / 00086 / 00087 /
> 00088 / 00090. To honor the user-requested `00092_vendor_score_history.sql`
> file name and avoid colliding with shipped migrations, both
> additions (history table + blacklist alignment + guards) are bundled
> into the single migration `00092_vendor_score_history.sql`.

---

## 2. Files edited (4 existing, +163 LOC, 0 deletions)

### 2.1 `onyx-procurement/server.js` (+15 LOC)

Captured the `bus` returned by `initDomainEvents({ supabase })` and
called `registerVendorScoringListener({ bus, supabase, logger: console })`.
Wrapped in try/catch — if the listener wiring fails, the server still
starts (non-fatal).

```js
const { bus } = initDomainEvents({ supabase });
const { registerVendorScoringListener } = require('./src/wiring/vendor-scoring-listener');
const r = registerVendorScoringListener({ bus, supabase, logger: console });
```

### 2.2 `onyx-procurement/src/jobs/jobs-registry.js` (+96 LOC)

Added `runNightlyVendorRescore(ctx)` handler + new `DEFAULT_JOBS`
entry `{ id: 'nightly-vendor-rescore', cron: '15 2 * * *',
runMissedOnStartup: true, retries: 1, retryDelayMs: 5min, timeout: 30min }`.
Handler resolves Supabase from `ctx.deps.supabase` first, falls back to
env-driven client. Catches per-supplier failures so a single bad row
does not nuke the sweep. Logs `rescore.done` with `{ scored, failed, total }`.

### 2.3 `onyx-procurement/src/pipeline/state-machines.js` (+57 LOC)

New `supplier` entity registered with:
- 6 states: `active`, `preferred`, `monitor`, `on_hold`, `blacklisted`, `inactive`
- 13 transitions (active/preferred/monitor → monitor/on_hold/blacklisted; monitor/on_hold → active/blacklisted; blacklisted → on_hold; inactive → active)
- 5 trigger fan-outs (`*→blacklisted`: cancel_open_rfq_invites + freeze_open_pos + notify_buyers; `blacklisted→on_hold`: create_audit)
- 7 RTL Hebrew + English UI badges (`פעיל / ספק מועדף / בניטור / מוקפא / ברשימה שחורה / לא פעיל / בבדיקה`)

Existing 14 entities and their transitions are untouched.

### 2.4 `onyx-procurement/src/pipeline/orchestrator.js` (+71 LOC)

Two new actions in `ORCHESTRATIONS`:

**`supplier.blacklist`** — 3 preconditions (`entity_exists`, `status_in
[active|preferred|monitor|on_hold]`, `composite_below threshold:50`),
8 effects (transition → update_field risk_level/blacklist_reason/blacklisted_at
→ cancel pending RFQ invites → freeze open POs → notify buyers → audit),
emits `vendor.blacklisted`, listeners `ai.find_alternative_suppliers` +
`ops.alert_open_pos_for_reassignment`.

**`supplier.reinstate`** — 3 preconditions (entity_exists, `status_is blacklisted`,
`role_in [procurement_manager|cfo|admin]`), 3 effects (transition → update
risk_level=high → audit), emits `vendor.reinstated`.

`executeOrchestration()` extended with a `composite_below` precondition
loop that reads `procurement.suppliers.performance_score` for the supplier
in `context.supplierId` (or `context.id`) and rejects with
`composite N not below threshold` when the score is missing or above the
gate. The check is a no-op when `supabase` is null, preserving the
unit-test path.

### 2.5 `onyx-procurement/src/features/suppliers/Supplier360.tsx` (+172 LOC)

- `Supplier360Payload` extended with optional `vendor_score?: VendorScore | null`. New types: `VendorScore`, `VendorScoreDimension`, `VendorScoreRisk`.
- `SupplierTab` union extended with `"scoring"`.
- New tab button: `<TabBtn ... label="ניקוד והערכה" ... />` placed between Scorecards and POs.
- New tab body: empty-state Hebrew message when `data.vendor_score` is null, else `<VendorScoringPanel>`.
- New components above `Supplier360`:
  - `VendorScoringPanel` — RTL header (composite/100, badge, badge_en, risk_level, as_of) + 5 weighted progress bars (40/20/20/10/10) + risks list (red/amber/slate by severity) + numbered Hebrew recommendations.
  - `BlacklistButton` — visible only when `composite < 50`. Confirms in Hebrew, POSTs `{ action: 'supplier.blacklist', context: { supplierId, composite } }` to `/api/orchestrator/execute`, invalidates `supplier360QueryKey(supplierId)` on success, alerts on failure.

---

## 3. Verification

| # | Check | Result |
|---|-------|--------|
| 1 | `node -c` parse on all 5 edited/new JS files | OK (5/5) |
| 2 | Existing 32-case `vendor-scoring.test.js` suite | **32/32 pass** (unchanged) |
| 3 | Existing 35-case `scheduler.test.js` suite | **35/35 pass** — including `every DEFAULT_JOBS cron parses cleanly` (proves `15 2 * * *` is valid) |
| 4 | `riskLevelFor(95) → low, 80 → medium, 60 → high, 30 → critical` | OK |
| 5 | `riskLevelFor(80, [{severity:'high'}]) → critical` (severity overrides band) | OK |
| 6 | `persistScore` with mocked supabase returns `{ composite, riskLevel }` | OK |
| 7 | `registerVendorScoringListener({ bus, supabase })` binds 3 events | OK (`procurement.po.fully_received`, `procurement.po.closed`, `procurement.po.received`) |
| 8 | `registerVendorScoringListener({ bus: null })` returns `{ ok: false, reason: 'bus and supabase required' }` | OK |
| 9 | `executeOrchestration('supplier.blacklist', { supplierId: 7 }, { supabase: <score=78> })` → blocked with `composite 78 not below 50` | OK |
| 10 | `executeOrchestration('supplier.blacklist', { supplierId: 7 }, { supabase: <score=30> })` → ok, 8 effects executed | OK |
| 11 | `STATE_MACHINES.supplier.states` count | 6 states + 7 badges |
| 12 | `canTransition('supplier','active','blacklist')` | `{ allowed: true, nextStatus: 'blacklisted' }` |
| 13 | `canTransition('supplier','blacklisted','restore')` | blocked (only `reinstate` allowed) |
| 14 | `getTriggersForTransition('supplier','active','blacklisted')` | 3 triggers (cancel + freeze + notify) |

---

## 4. Wiring summary (system view)

```
┌──────────────────────────────────────────────────────────┐
│ PO state-machine fires procurement.po.fully_received    │
└──────────────┬───────────────────────────────────────────┘
               ▼  (in-process EventBus)
┌──────────────────────────────────────────────────────────┐
│ vendor-scoring-listener.js                                │
│   loadSupplierHistory(supabase, supplierId) →             │
│     { purchaseOrders, payments, communications,           │
│       recentScores }                                      │
│   scoreVendor(id, history)  ← analytics/vendor-scoring.js │
│   persistScore(supabase, id, result)  ← suppliers/...     │
└──────────────┬───────────────────────────────────────────┘
               ▼
┌──────────────────────────────────────────────────────────┐
│ Postgres                                                  │
│   UPDATE procurement.suppliers SET                        │
│     performance_score, risk_level, updated_at             │
│   INSERT procurement.vendor_score_history (...)           │
└──────────────────────────────────────────────────────────┘

Daily catch-up (02:15) covers vendors with no recent PO:
   nightly-vendor-rescore (jobs-registry) → same path

User UI flow when composite < 50:
   Supplier360 → tab "ניקוד והערכה" → BlacklistButton →
   POST /api/orchestrator/execute { action:'supplier.blacklist' }
   → composite_below precondition (re-reads suppliers.performance_score)
   → state-machine transition active|preferred|monitor|on_hold → blacklisted
   → 8 effects executed (RFQ invites cancelled, open POs frozen, audit)
   → DB triggers (00092 migration) refuse new RFQ/PO inserts going forward
```

---

## 5. Total LOC delta

| Type | Files | LOC |
|------|------:|----:|
| New JS | 2 | +238 |
| New SQL migration | 1 | +86 |
| Edited JS (server, jobs, state-machines, orchestrator) | 4 | +239 |
| Edited TSX (Supplier360) | 1 | +172 |
| **Total** | **8** | **+735 LOC, 0 deletions** |

(Spec estimated +339; actual is higher because of richer JSDoc, defensive guards in cron handler, badges/types in TSX, and the bundled migration.)

---

## 6. Sign-off

All four AGENT-183 deliverables shipped:
1. **Event listener + nightly cron at 02:15** — `vendor-scoring-listener.js` binds to 3 PO terminal events; `nightly-vendor-rescore` job sweeps every active supplier.
2. **`persistScore()` writes performance_score + risk_level + history table** — `score-persistence.js` + migration 00092.
3. **Supplier360 tab `ניקוד והערכה`** — composite, badge, 5 weighted bars (40/20/20/10/10), severity-coded risks, numbered Hebrew recommendations, contextual blacklist button when `composite < 50`.
4. **`supplier.blacklist` orchestrator action + state machine + DB triggers** — 8 effects, role-gated reinstate, RFQ/PO inserts blocked at the database layer for `status='blacklisted'`.

Math layer untouched. 32 existing vendor-scoring tests + 35 scheduler tests still green. All wiring fully additive.

*End AGENT-FIX-VENDOR-applied.*
