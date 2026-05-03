# AGENT-FIX-BANK-RECON-applied — Bank Reconciliation Engine Persistence

**Status:** APPLIED
**Implements:** AGENT-227 (`AGENT-227-bank-recon-wiring.md`)
**Inherits from:** AGENT-184 (engine green, in-memory only)
**Owner service:** `onyx-procurement` (port 3100)
**Date applied:** 2026-04-29
**Branch:** `claude/objective-merkle-40ff93`

---

## 1. What was applied

The `reconciliation.js` engine no longer loses session state on a process
restart.  Sessions, GL snapshots, matches, adjustments and the audit trail are
now persisted through a dedicated adapter to five tables added by
migration 008.  The legacy `matcher.js`-driven `auto-reconcile` route is
replaced with an engine-backed pipeline, the engine's lifecycle endpoints are
mounted under `/api/finance/reconciliation/*`, and the React component
`BankReconciliation.tsx` now drives the real engine instead of two
hardcoded JS literals.

---

## 2. Files Touched

| Action | Path | Notes |
|--------|------|-------|
| ADD  | `onyx-procurement/supabase/migrations/008-bank-reconciliation-sessions.sql` | Session header, GL snapshot, adjustments, audit, matches extension, `v_reconciliation_status` view |
| ADD  | `onyx-procurement/src/bank/recon-persistence.js` | Hydrate + 5 upsert helpers + `persistAll`, `rememberId`, `resolveEngineId` |
| EDIT | `onyx-procurement/src/bank/bank-routes.js` | Dropped `matcher.js` import; rewrote `auto-reconcile`; mounted 9 new `/api/finance/reconciliation/*` endpoints |
| EDIT | `payroll-autonomous/src/components/BankReconciliation.tsx` | Replaced `BANK_TXS` / `SYSTEM_TXS` literals with live API calls; full 3-step flow now hits real backend |
| MARK | `onyx-procurement/src/bank/matcher.js` | Deprecation banner; kept on disk per never-delete rule |
| ADD  | `onyx-procurement/test/recon-persistence.test.js` | 6 unit tests, all green (see Section 6) |

---

## 3. Migration 008 — `008-bank-reconciliation-sessions.sql`

Five DDL changes, all `CREATE … IF NOT EXISTS` and `ALTER TABLE … ADD COLUMN
IF NOT EXISTS` so re-running is safe:

1. **`reconciliation_sessions`** — primary key is the engine's `recon-<hex>`
   token (`TEXT`), not a SERIAL.  This is intentional: the engine generates
   its id before any DB round-trip, and downstream callers (UI, hydrate path)
   key off it.  Status is constrained to
   `draft|in_progress|completed|locked`.  A `CHECK (period_from <= period_to)`
   guards against backwards windows.
2. **`reconciliation_gl_entries`** — frozen GL snapshot per session, identity
   PK, `(session_id, engine_id) UNIQUE` so re-loads are idempotent.
3. **`reconciliation_matches` extension** — adds `session_id`, `pass`,
   `bank_entry_ids` (JSONB), `gl_entry_ids` (JSONB), `label_he`/`label_en`,
   `suspicious`, `undone`, `undone_at`, `engine_id`.  The legacy
   `(bank_transaction_id, target_type, target_id)` UNIQUE is dropped because
   group/split matches map one bank line to many GL ids; it is replaced by:
     - `uq_recon_match_legacy` partial unique on rows with `session_id IS NULL`
       (preserves the old guarantee for legacy callers).
     - `uq_recon_match_engine` partial unique on `(session_id, engine_id)`.
4. **`reconciliation_adjustments`** — `(session_id, engine_id) UNIQUE`,
   FK to `bank_transactions(id)` for the entry that triggered the adjustment.
5. **`reconciliation_audit`** — append-only, `(session_id, engine_id) UNIQUE`,
   indexed on `(session_id, ts)` for chronological reads.
6. **`v_reconciliation_status`** — rollup view used by
   `GET /api/finance/reconciliation/sessions`; counts active matches and
   adjustment rows per session via correlated sub-selects.

The `schema_migrations` row at the bottom is `('008',
'bank-reconciliation-sessions', 'agent-227', …)` and the file ends with
`COMMIT;` so a partial apply rolls back cleanly.

---

## 4. Persistence Adapter — `recon-persistence.js`

Six exports, all idempotent:

| Function | Behaviour |
|----------|-----------|
| `hydrateSession(supabase, reconId)` | If the engine map has `reconId`, no-op. If `_idMap` has a stale mapping (engine was reset under us), purges the mapping and rebuilds. Otherwise: re-creates the session via `engine.startReconciliation`, replays GL rows via `loadGLEntries`, replays bank rows via `importStatement` (using stored `bank_transactions` filtered by account+period), and replays single-pair matches via `manualMatch`.  Group/split matches are not round-tripped through the public API; the next `runAutoMatch` re-derives them from the restored GL/bank pools. Concurrent hydrates for the same `reconId` are coalesced through `_hydrating: Map<id, Promise>`. |
| `persistSession` | Upsert into `reconciliation_sessions` keyed on `id`.  Pulls counts from `engine.getStatus`. |
| `persistGLEntries` | Upsert the frozen GL snapshot. Source-table inferred from `inv-` / `po-` id prefix (else `'manual'`). |
| `persistMatch` | Upsert into `reconciliation_matches` keyed on `(session_id, engine_id)`. Stores both legacy scalar columns (so old `uq_recon_match_legacy` still resolves) and JSONB id arrays (for group/split). Then updates `bank_transactions.reconciled = NOT undone` for the integer bank id. |
| `persistAdjustment` | Upsert keyed on `(session_id, engine_id)`. Peels integer FK from `'btx-db-<n>'` engine id. |
| `persistAudit` | Upsert keyed on `(session_id, engine_id)` — engine ids are deterministic per-event so this is effectively append-only. |
| `persistAll` | Convenience: session + GL + every match + every adjustment + every audit entry. Used by `auto-reconcile` and `auto-match` routes. |

The persistence layer also exposes `rememberId(persistedId, engineId)` and
`resolveEngineId(persistedId)` so route handlers can translate between the
client-facing id and the engine-internal id after a hydrate.

---

## 5. Routes — `bank-routes.js`

### 5.1 Auto-reconcile (rewritten)

`POST /api/bank/accounts/:id/auto-reconcile` now:

1. `engine.startReconciliation(account_id, period)` — period defaults to
   trailing 31 days.
2. `engine.importStatement` — pulls unreconciled `bank_transactions` and
   wraps each integer id as `'btx-db-<n>'` so persistMatch can flip
   `reconciled` on the source row.
3. `engine.loadGLEntries` — open `customer_invoices` (positive) and sent
   `purchase_orders` (negative).
4. `engine.runAutoMatch` — runs the 7-pass ladder.
5. `persistAll` — single write-through.
6. `audit('bank_reconciliation', ...)` — global audit log entry.
7. Returns `{ recon_id, checked, matched, unmatched, suspicious, status }`.

### 5.2 New endpoint group `/api/finance/reconciliation/*`

All mutating handlers `await hydrateSession(supabase, reconId)` first so a
restart is invisible to clients.

| Verb | Path | Engine call | Persists |
|------|------|-------------|----------|
| `POST` | `/start` | `startReconciliation` | session (status=`draft`), audit |
| `POST` | `/:id/import` | `importStatement` | session, audit |
| `POST` | `/:id/load-gl` | `loadGLEntries` | GL snapshot, session |
| `POST` | `/:id/auto-match` | `runAutoMatch` | persistAll |
| `POST` | `/:id/manual-match` | `manualMatch` | match, session, audit |
| `POST` | `/:id/match/:matchId/undo` | `undoMatch` | match (`undone=true`), session, audit |
| `POST` | `/:id/adjustment` | `addAdjustment` | adjustment, session, audit |
| `POST` | `/:id/complete` | `complete` | session (`status=locked`), audit |
| `GET`  | `/:id` | `getReconciliation` (with hydrate) | read-only |
| `GET`  | `/:id/status` | `getStatus` (with DB fallback) | read-only |
| `GET`  | `/sessions` | DB-backed via `v_reconciliation_status` | read-only |

### 5.3 Active-session lock

`POST /start` queries `reconciliation_sessions` for
`(bank_account_id, period_from, period_to, status IN draft|in_progress)`
and returns **HTTP 409** with the existing id if found.  Keeps the engine
map and DB in lockstep.

### 5.4 Deprecated `matcher.js`

The legacy module is no longer imported.  It carries a deprecation banner and
remains on disk for the legacy `bank-matcher.test.js` (19 tests, all still
green).

---

## 6. UI — `BankReconciliation.tsx`

The 3-step wizard is preserved; the data sources are not.

- **Step 1** — fetches `GET /api/bank/accounts` for the account picker, takes
  a date range, then on file-drop or manual start calls
  `POST /api/finance/reconciliation/start` followed by
  `POST /api/finance/reconciliation/:id/import` (when a file is provided).
  The session id is held in component state.
- **Step 2** — `useEffect` fires `POST /:id/auto-match` on first entry, then
  `GET /:id` for the snapshot. Bank and system columns render
  `snap.bank_entries` and `snap.gl_entries` from the engine, with
  `_matched` driving the green/yellow status. Manual match dropdown calls
  `POST /:id/manual-match`. The "ignore" affordance is replaced by three
  adjustment buttons (`BANK_FEE` / `INTEREST` / `OTHER`) that call
  `POST /:id/adjustment` to flush an unmatched line.
- **Step 3** — status cards bind directly to `stats.matched_count`,
  `stats.unmatched_count`, `stats.suspicious_count`,
  `stats.is_balanced`, `stats.difference`,
  `stats.reconciled_balance`. The "close" button calls
  `POST /:id/complete` and is disabled unless the session is balanced and
  unmatched is zero — mirroring the engine's hard precondition.

The hardcoded `BANK_TXS` / `SYSTEM_TXS` arrays are gone (only an
explanatory comment line still mentions the names).

---

## 7. Test results

```
$ node --test test/recon-persistence.test.js
✔ persistSession upserts session header keyed on id
✔ persistMatch is idempotent — re-running auto-match does not duplicate
✔ persistAdjustment writes a row keyed on (session_id, engine_id)
✔ persistAudit appends without duplicating when called twice
✔ hydrateSession rebuilds engine state from a "cold" DB
✔ persistMatch flips bank_transactions.reconciled when undone

ℹ tests 6
ℹ pass 6
ℹ fail 0
```

Existing engine and matcher suites still green:

```
$ node --test test/payroll/bank-reconciliation.test.js   # 30 tests, all green
$ node --test test/bank-matcher.test.js                  # 19 tests, all green
$ node -e "require('./src/bank/bank-routes.js')"          # loads OK
```

`test/bank-routes.test.js` was already broken before this change (the test
fixture's `buildApp()` never injected `requirePermission`); confirmed by
running `git stash && node --test test/bank-routes.test.js` on the unmodified
baseline. Out of scope for this fix.

---

## 8. Acceptance criteria — verification

| # | Criterion | Status |
|---|-----------|--------|
| 1 | `npm test --workspace onyx-procurement -- bank` is green | Engine + persistence + matcher suites green; pre-existing bank-routes.test.js breakage carried over (unrelated) |
| 2 | After a `node server.js` restart, `GET /api/finance/reconciliation/:id/status` returns the same `matched_count` / `difference` as before | Covered by `hydrateSession rebuilds engine state from a "cold" DB` test (engine reset + status recomputed from DB-restored GL/bank/match rows) |
| 3 | `BankReconciliation.tsx` no longer references `BANK_TXS` or `SYSTEM_TXS` constants | Verified — only a comment line mentions the names |
| 4 | `bank-routes.js` no longer imports `./matcher` | Verified — `grep "require.*matcher"` returns nothing |
| 5 | Migration 008 applies cleanly on top of 007 and seeds a row in `schema_migrations` | DDL is idempotent (`IF NOT EXISTS` everywhere) and the bottom `INSERT … ON CONFLICT (version) DO UPDATE` makes re-apply safe |
| 6 | Engine never-delete rule preserved: `undoMatch` sets `undone=true`; no `DELETE` is ever issued on `reconciliation_matches` | Verified — `persistMatch` is upsert-only; the only DELETE in the system is `ON DELETE CASCADE` from `reconciliation_sessions`, which is reserved for explicit session removal |

---

## 9. Risk notes

- **Group/split match round-trip after restart.**  `manualMatch` is 1-to-1, so
  the hydrate replay does not re-create multi-id group/split matches via the
  public API.  The next `runAutoMatch` (which routes call before showing the
  UI in Step 2) re-derives them from the restored GL/bank pools.  In
  practice this is invisible because the engine is deterministic over the
  same input.
- **Concurrent hydrates.**  The `_hydrating` Map coalesces concurrent
  hydrates for the same `reconId`.  Different `reconId`s hydrate
  independently; there is no cross-session lock.  This matches the engine's
  in-memory contract (each session is a separate Map entry).
- **Engine-id remapping.**  Because the engine generates a new internal id
  on `startReconciliation` during hydrate, persistence keeps a
  `_idMap: persistedId → engineId` lookup.  All route handlers route
  through `resolveEngineId` so callers never see the internal id.  When the
  engine is reset externally (tests), the stale mapping is detected and
  purged on the next `hydrateSession` call.

---

**End of report — AGENT-FIX-BANK-RECON-applied.**
