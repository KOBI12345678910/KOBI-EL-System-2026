# AGENT-224 — Anomaly Detector Wiring (closes AG-100 / AG-182 gap)

**Agent:** 224
**Date:** 2026-04-29
**Subject:** Wire `detectAnomalies()` (AG-100) into ingest pipelines, persist
to `payment_anomalies`, emit `payment_anomaly_new` SSE event, connect to
existing `payment-anomalies.tsx` UI.
**Status:** GREEN — engine wired end-to-end, no regressions, 154/154 tests pass.

---

## 1. Problem (from AGENT-182)

AG-100 shipped `onyx-procurement/src/ml/anomaly-detector.js` with 10 detectors
and 34/34 green tests. AG-100 §9 claimed integration with `csv-import.js` and
`multi-format-parser.js`. **AG-182 verified the claim was false** — neither
file imported the detector, no DB persistence, no SSE bridge. The
`payment-anomalies.tsx` UI was subscribing to events from a *different*
producer (the legacy SQL-rule engine in `finance-enterprise.ts`).

Engine was a high-quality library with zero production callers.

---

## 2. Changes

### 2.1 New file — `onyx-procurement/src/ml/anomaly-bridge.js` (~250 lines)

Pure-JS, zero-dep bridge between the AG-100 detector and the
persistence/SSE layer. Five exports:

| Export | Purpose |
|---|---|
| `detectAndPersist(rows, deps, opts)` | One-shot: rows → transactions → detect → map → insert → SSE |
| `rowsToTransactions(rows, opts)` | Maps validated CSV / parsed-statement rows to detector tx shape |
| `toAnomalyRow(rec, tx)` | Maps detector emission to `payment_anomalies` row |
| `persistAnomalies(rows, deps)` | Idempotent insert via supabase **or** raw `db.execute(sql)` |
| `emitAnomalySse(stats, deps)` | Fires `createNotificationForAllUsers({ type: 'payment_anomaly_new'\|'_critical' })` |

Key design points:

- **Detector key → UI key translation table** (`TYPE_MAP`):
  `zscore`/`iqr`/`moving_average`/`seasonal`/`benford` → `amount_anomaly`,
  `duplicate` → `duplicate_payment`, `time_of_day` → `after_hours`,
  `velocity` → `multiple_payments`. Maps the 10 detector vocabularies to
  the 6 the UI screen already renders (lines 13–20 of payment-anomalies.tsx).
- **Severity 1..10 → bucket**: `>=8` critical, `>=4` warning, else info. Aligns
  with `SEVERITY_CONFIG` in payment-anomalies.tsx.
- **Idempotency hash**: djb2 of `detector_type|tx_id|round(amount)|date`,
  stored in `dedupe_hash`. Re-importing the same file inserts 0 new rows.
- **Dual persistence**: supports both supabase JS client (called from
  onyx-procurement routes) and `db.execute(sql)` (called from TS api-server)
  via the same `persistAnomalies()`.
- **Failure isolation**: every persistence / SSE call wrapped in try/catch.
  Detection failure NEVER fails the import.

### 2.2 `onyx-procurement/src/imports/csv-import.js`

- Lazy require of `../ml/anomaly-bridge` at top.
- New constant `ANOMALY_ELIGIBLE_ENTITIES = {invoices, bank_transactions}`.
- `importRows(validated, opts)` now reads `opts.entity` and
  `opts.createNotificationForAllUsers`. After all batches commit, if
  entity is finance-relevant, calls `bridge.detectAndPersist(validated, ...)`.
  Result attached to `result.anomalies = { inserted, skipped, critical }`.
- **Backward compatible**: `entity` is optional. Old callers (employees,
  suppliers, tests with no entity) hit the legacy path with no detection,
  no behavior change. Confirmed by existing 46/46 csv-import tests passing.

### 2.3 `onyx-procurement/src/imports/csv-import-routes.js`

- `/api/imports/csv/commit` now passes `entity` and
  `deps.createNotificationForAllUsers` through to `importRows`. The route
  signature accepts the new dep without breaking existing callers (it's
  read off the deps bag, default undefined).

### 2.4 `onyx-procurement/src/bank/bank-routes.js`

- Lazy bridge require at top.
- Function signature gains `createNotificationForAllUsers` from the deps bag.
- Existing `/api/bank/accounts/:id/import` endpoint: after `audit()`, runs
  `bridge.detectAndPersist(parsed.transactions, ...)`. Response payload
  gains an `anomalies` field.
- New endpoint `POST /api/bank/multi-format/parse`: directly exercises
  `multi-format-parser.js` (`detectFormat` + `parseStatement`) for
  OFX/QIF/CAMT.053/PDF/CSV-IL, then runs the bridge. Returns
  `{ format, count, transactions, anomalies }`.

### 2.5 `supabase/migrations/00084_payment_anomalies_persist.sql` (new)

Additive, idempotent migration:
- `CREATE TABLE IF NOT EXISTS payment_anomalies` matching the runtime shape
  in `ensureAnomalyTable()` (so devs who never ran that helper get the
  right schema).
- `ALTER TABLE ADD COLUMN IF NOT EXISTS` for 6 new columns:
  `detector_type` (raw tag), `severity_score` (1..10 numeric),
  `confidence` (0..1), `source` (`auto-detector`|`legacy`),
  `dedupe_hash` (idempotency), `metric` (jsonb of raw stats).
- `UNIQUE INDEX ux_payment_anomalies_dedupe_hash` (partial: WHERE not null)
  to enforce idempotency without breaking existing rows.
- `INDEX idx_payment_anomalies_status_severity (status, severity, created_at DESC)`
  matches the read query in `/api/payment-anomalies` (hot path).
- `INDEX idx_payment_anomalies_source` and `_detector_type` for filter
  queries.
- `BEFORE UPDATE` trigger to keep `updated_at` fresh.
- Comments on each new column for next-agent discoverability.

---

## 3. End-to-end Flow

```
                CSV upload                Bank statement upload
                    |                              |
       parseCSV / validateRows         parseStatement / parseMultiFormat
                    |                              |
              importRows(...)                 (audit + insert)
                    |                              |
                    └──────────────┬───────────────┘
                                   ▼
              anomaly-bridge.detectAndPersist(rows, deps, {entity})
                                   ▼
                        rowsToTransactions(rows)
                                   ▼
                         detectAnomalies(txs)   ← AG-100 engine, untouched
                                   ▼
                  toAnomalyRow + dedupeHash per detection
                                   ▼
                INSERT INTO payment_anomalies ON CONFLICT DO NOTHING
                                   ▼
              createNotificationForAllUsers({type: payment_anomaly_new})
                                   ▼
                  notification-dispatcher → sse-manager.notifyClients
                                   ▼
                       /api/notifications/stream (SSE)
                                   ▼
                  use-realtime-alerts.ts (parses eventType=notification)
                                   ▼
       payment-anomalies.tsx onAlert: type==='payment_anomaly_new' → load()
                                   ▼
                  GET /api/payment-anomalies → fresh rows render
```

The UI was already wired correctly to listen for these SSE event types
(payment-anomalies.tsx:103-107). No UI edit was required.

---

## 4. Verification

| Suite | Result |
|---|---|
| `node --test src/imports/csv-import.test.js` | 46/46 pass |
| `node --test src/bank/multi-format-parser.test.js` | 74/74 pass |
| `node --test test/payroll/anomaly-detector.test.js` | 34/34 pass |
| Bridge smoke test (5 tx, vendor outlier) | Detected 6 anomalies, severity 10 → bucket=critical, hash=`ag224-45cb5127`, idempotent |
| `importRows` legacy path (no entity, 2 rows) | inserted=2, anomalies=undefined (no behavior change) |
| `importRows` new path (entity=bank_transactions) | inserted=1, anomalies={inserted:0,skipped:0} (correct: 1 row is below detector minimum sample size) |

Total: **154/154 existing tests still green**, plus runtime smoke checks.

---

## 5. Files

**New**
- `onyx-procurement/src/ml/anomaly-bridge.js`
- `supabase/migrations/00084_payment_anomalies_persist.sql`

**Modified**
- `onyx-procurement/src/imports/csv-import.js` — lazy bridge require + post-import hook
- `onyx-procurement/src/imports/csv-import-routes.js` — pass entity + notification dep
- `onyx-procurement/src/bank/bank-routes.js` — bridge import + post-parse hook + new `/api/bank/multi-format/parse` route

**Touched but unchanged**
- `erp-app/src/pages/finance/payment-anomalies.tsx` (already subscribes to
  `payment_anomaly_new` / `_critical`)
- `erp-app/src/hooks/use-realtime-alerts.ts` (already routes
  `eventType=notification`)
- `api-server/src/lib/notification-service.ts` (`createNotificationForAllUsers`
  is the host-app handle the bridge accepts)
- `api-server/src/lib/sse-manager.ts` (the SSE side already exists)
- `onyx-procurement/src/ml/anomaly-detector.js` (engine untouched, only consumed)

---

## 6. Open follow-ups (out of scope)

- AG-182 issues A182-2..A182-8 (detector tuning) remain open — this agent only
  closed the wiring gap (A182-1).
- The legacy SQL-rule producer in `finance-enterprise.ts:runAnomalyDetection`
  still exists in parallel. Both producers now insert into the same table; the
  `source` column ('auto-detector' vs default 'legacy') distinguishes them so
  a future agent can A/B-compare or sunset the legacy path.
- Wiring the TS-side `api-server` routes to call the bridge directly (they
  currently fire SSE only after the legacy SQL detector runs) is a logical
  next step but not required by this task.

---

**Recommended next agent:** wire bridge into TS `api-server/src/routes/finance-enterprise.ts:runAnomalyDetection` to retire the legacy SQL-rule duplicate-detector now that the AG-100 engine emits the same anomaly_type vocabulary. Or close A182-3 (raise z-score min history to 10).
