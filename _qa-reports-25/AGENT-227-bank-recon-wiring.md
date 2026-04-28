# AGENT-227 — Bank Reconciliation Engine Persistence & Wiring

**Status:** GAP CONFIRMED → IMPLEMENTATION PROVIDED
**Scope:** Persist `onyx-procurement/src/bank/reconciliation.js` engine state, replace legacy `matcher.js`-driven routes, wire `BankReconciliation.tsx` to a real API.
**Owner service:** `onyx-procurement` (port 3100)
**Date:** 2026-04-29
**Inherits from:** AGENT-184 (engine green, in-memory only)

---

## 1. Gap Analysis

| Layer | Current state | Gap |
|-------|---------------|-----|
| **Engine** (`reconciliation.js`, 1043 LOC) | Multi-pass ladder, manual match, undo, complete, audit | Sessions live in `_sessions = new Map()` (line 142) — lost on restart |
| **DB** (migration 006) | `bank_accounts`, `bank_statements`, `bank_transactions`, `reconciliation_matches`, `reconciliation_discrepancies` | No session header, no GL snapshot, no FK from match → session, no audit/adjustments tables |
| **Routes** (`bank-routes.js`) | Calls legacy `matcher.autoReconcileBatch()`, returns suggestions only | Engine `start/import/manual/undo/complete` are not exposed |
| **UI** (`BankReconciliation.tsx`) | Hardcoded `BANK_TXS` / `SYSTEM_TXS` constants, single POST to non-existent `/api/finance/reconciliation/close` | No call to start/import/auto/match/complete; state is React-only |

---

## 2. Migration — `008-bank-reconciliation-sessions.sql`

**File to add:** `onyx-procurement/supabase/migrations/008-bank-reconciliation-sessions.sql`

```sql
BEGIN;

-- 2.1  Session header (the engine s.id, status, period, balance)
CREATE TABLE IF NOT EXISTS reconciliation_sessions (
  id                          TEXT PRIMARY KEY,            -- 'recon-<hex>' from engine _uid()
  bank_account_id             INTEGER NOT NULL REFERENCES bank_accounts(id),
  period_from                 DATE NOT NULL,
  period_to                   DATE NOT NULL,
  status                      TEXT NOT NULL DEFAULT 'draft'
                                CHECK (status IN ('draft','in_progress','completed','locked')),
  opening_balance             NUMERIC(14,2) DEFAULT 0,
  statement_closing_balance   NUMERIC(14,2) DEFAULT 0,
  matched_count               INTEGER DEFAULT 0,
  unmatched_count             INTEGER DEFAULT 0,
  suspicious_count            INTEGER DEFAULT 0,
  difference                  NUMERIC(14,2),
  is_balanced                 BOOLEAN DEFAULT FALSE,
  created_by                  TEXT,
  completed_by                TEXT,
  completed_at                TIMESTAMPTZ,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (period_from <= period_to)
);
CREATE INDEX IF NOT EXISTS idx_recon_sess_account ON reconciliation_sessions(bank_account_id, status);

-- 2.2  GL snapshot (engine works on a frozen view of the ledger)
CREATE TABLE IF NOT EXISTS reconciliation_gl_entries (
  id                INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  session_id        TEXT NOT NULL REFERENCES reconciliation_sessions(id) ON DELETE CASCADE,
  engine_id         TEXT NOT NULL,                          -- 'gl-<hex>'
  source_table      TEXT,                                    -- 'customer_invoices'|'purchase_orders'|'manual'
  source_id         TEXT,
  transaction_date  DATE,
  description       TEXT,
  reference         TEXT,
  amount            NUMERIC(14,2),
  counterparty_name TEXT,
  matched           BOOLEAN NOT NULL DEFAULT FALSE,
  match_id          INTEGER,
  raw_data          JSONB,
  UNIQUE (session_id, engine_id)
);
CREATE INDEX IF NOT EXISTS idx_recon_gl_session ON reconciliation_gl_entries(session_id, matched);

-- 2.3  Extend reconciliation_matches with session linkage and split/group support
ALTER TABLE reconciliation_matches
  ADD COLUMN IF NOT EXISTS session_id      TEXT REFERENCES reconciliation_sessions(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS pass            TEXT,
  ADD COLUMN IF NOT EXISTS bank_entry_ids  JSONB,           -- ['btx-...', ...]  for split/group
  ADD COLUMN IF NOT EXISTS gl_entry_ids    JSONB,
  ADD COLUMN IF NOT EXISTS label_he        TEXT,
  ADD COLUMN IF NOT EXISTS label_en        TEXT,
  ADD COLUMN IF NOT EXISTS suspicious      BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS undone          BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS undone_at       TIMESTAMPTZ;

-- The legacy UNIQUE (bank_transaction_id, target_type, target_id) blocks engine
-- group/split matches — replace with a session-scoped uniqueness for new rows.
ALTER TABLE reconciliation_matches DROP CONSTRAINT IF EXISTS reconciliation_matches_bank_transaction_id_target_type_target_key;
CREATE UNIQUE INDEX IF NOT EXISTS uq_recon_match_legacy
  ON reconciliation_matches (bank_transaction_id, target_type, target_id)
  WHERE session_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_recon_match_session ON reconciliation_matches(session_id);

-- 2.4  Adjustments (bank fee, interest, FX) — engine.addAdjustment() target
CREATE TABLE IF NOT EXISTS reconciliation_adjustments (
  id              INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  session_id      TEXT NOT NULL REFERENCES reconciliation_sessions(id) ON DELETE CASCADE,
  engine_id       TEXT NOT NULL,
  kind            TEXT NOT NULL CHECK (kind IN ('BANK_FEE','INTEREST','INTEREST_EXPENSE','FX_DIFF','ERROR','OTHER')),
  amount          NUMERIC(14,2) NOT NULL,
  adjustment_date DATE NOT NULL,
  description     TEXT,
  label_he        TEXT,
  label_en        TEXT,
  bank_entry_id   BIGINT REFERENCES bank_transactions(id),
  created_by      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (session_id, engine_id)
);
CREATE INDEX IF NOT EXISTS idx_recon_adj_session ON reconciliation_adjustments(session_id);

-- 2.5  Per-session audit (mirrors engine s.audit array, never deleted)
CREATE TABLE IF NOT EXISTS reconciliation_audit (
  id          INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  session_id  TEXT NOT NULL REFERENCES reconciliation_sessions(id) ON DELETE CASCADE,
  engine_id   TEXT NOT NULL,
  ts          TIMESTAMPTZ NOT NULL,
  action      TEXT NOT NULL,
  label_en    TEXT, label_he TEXT,
  details     JSONB
);
CREATE INDEX IF NOT EXISTS idx_recon_audit_session ON reconciliation_audit(session_id, ts);

-- 2.6  Status rollup view for /api/finance/reconciliation/sessions
CREATE OR REPLACE VIEW v_reconciliation_status AS
SELECT s.id, s.bank_account_id, ba.account_name, ba.bank_name,
       s.period_from, s.period_to, s.status,
       s.matched_count, s.unmatched_count, s.suspicious_count,
       s.opening_balance, s.statement_closing_balance, s.difference, s.is_balanced,
       s.completed_by, s.completed_at, s.created_at,
       (SELECT COUNT(*) FROM reconciliation_matches m
          WHERE m.session_id = s.id AND NOT m.undone) AS active_match_count,
       (SELECT COUNT(*) FROM reconciliation_adjustments a
          WHERE a.session_id = s.id) AS adjustment_count
FROM reconciliation_sessions s
JOIN bank_accounts ba ON ba.id = s.bank_account_id;

INSERT INTO schema_migrations (version, name, checksum, notes)
VALUES ('008', 'bank-reconciliation-sessions', 'agent-227',
        'Session, GL snapshot, adjustments, audit; matches extended.')
ON CONFLICT (version) DO UPDATE SET applied_at = NOW(), notes = EXCLUDED.notes || ' (re-applied)';
COMMIT;
```

---

## 3. Routes — replace `bank-routes.js` legacy auto-reconcile

**File to edit:** `onyx-procurement/src/bank/bank-routes.js`

Drop `const { autoReconcileBatch } = require('./matcher')` and import the engine + persistence adapter:

```js
const engine = require('./reconciliation');
const {
  hydrateSession, persistSession, persistMatch,
  persistAdjustment, persistAudit,
} = require('./recon-persistence');
```

### 3.1 New endpoint group `/api/finance/reconciliation/*`

| Verb | Path | Engine call | Persists |
|------|------|-------------|----------|
| `POST` | `/start` | `startReconciliation(account_id, period)` | session row (status=`draft`), audit |
| `POST` | `/:id/import` | `importStatement(id, txs)` | bank_transactions + engine bank_entries, audit |
| `POST` | `/:id/load-gl` | `loadGLEntries(id, glRows)` | reconciliation_gl_entries |
| `POST` | `/:id/auto-match` | `runAutoMatch(id)` | matches (one per pass), updates GL/bank flags, audit |
| `POST` | `/:id/manual-match` | `manualMatch(id, glId, bankId)` | match (pass=`manual`), audit |
| `POST` | `/:id/match/:matchId/undo` | `undoMatch(id, matchId)` | sets `undone=true`, releases flags, audit |
| `POST` | `/:id/adjustment` | `addAdjustment(id, body)` | reconciliation_adjustments, audit |
| `POST` | `/:id/complete` | `complete(id, userId)` | session `status=locked`, audit |
| `GET`  | `/:id` | `getReconciliation(id)` (with hydrate) | read-only |
| `GET`  | `/:id/status` | `getStatus(id)` | read-only |
| `GET`  | `/sessions` | DB-backed list from `v_reconciliation_status` | read-only |

Every mutating handler must `await hydrateSession(supabase, id)` before delegating to the engine; this is what survives a process restart.

### 3.2 Replace the legacy `auto-reconcile` route

Old (`bank-routes.js:128-163`) calls `autoReconcileBatch` and returns suggestions only. New body:

```js
app.post('/api/bank/accounts/:id/auto-reconcile',
  requirePermission('bank-reconciliation:create'), async (req, res) => {
    const reconId = engine.startReconciliation(req.params.id, req.body.period || {
      from: req.body.from || new Date(Date.now() - 31*86400000).toISOString().slice(0,10),
      to:   req.body.to   || new Date().toISOString().slice(0,10),
    });
    const { data: txs } = await supabase.from('bank_transactions')
      .select('*').eq('bank_account_id', req.params.id).eq('reconciled', false).limit(500);
    engine.importStatement(reconId, txs || []);

    const { data: invoices } = await supabase.from('customer_invoices')
      .select('id, invoice_number, customer_name, invoice_date, gross_amount, amount_outstanding')
      .neq('status','paid').neq('status','voided');
    const { data: pos } = await supabase.from('purchase_orders')
      .select('id, supplier_name, total, created_at').eq('status','sent');
    engine.loadGLEntries(reconId, [
      ...(invoices||[]).map(i => ({ id:`inv-${i.id}`, amount:i.amount_outstanding||i.gross_amount,
        transaction_date:i.invoice_date, description:i.invoice_number, counterparty_name:i.customer_name })),
      ...(pos||[]).map(p => ({ id:`po-${p.id}`, amount:-p.total,
        transaction_date:p.created_at, counterparty_name:p.supplier_name })),
    ]);

    const stats = engine.runAutoMatch(reconId);
    await persistSession(supabase, reconId);
    for (const m of engine.getReconciliation(reconId).matches) await persistMatch(supabase, reconId, m);
    for (const a of engine.getReconciliation(reconId).audit)   await persistAudit(supabase, reconId, a);

    await audit('bank_reconciliation', parseInt(req.params.id), 'auto_matched', req.actor||'api',
      `התאמה אוטומטית: ${stats.matched} התאמות, ${stats.unmatched} לא תואמו`, null, { reconId, stats });
    res.json({ recon_id: reconId, ...stats, status: engine.getStatus(reconId) });
  });
```

`matcher.js` is no longer imported by `bank-routes.js`. Keep on disk with a `// DEPRECATED — superseded by reconciliation.js` banner (never-delete rule).

### 3.3 Persistence adapter — `onyx-procurement/src/bank/recon-persistence.js` (new)

Five functions, all idempotent, all `upsert`-based — never `DELETE`.

- `hydrateSession(supabase, reconId)` — if `engine.listReconciliations()` lacks the id, replay session header + bank_entries + GL + matches + adjustments back into the engine map. No-op when already hydrated.
- `persistSession(supabase, reconId)` — `upsert` into `reconciliation_sessions` keyed on `id`. Includes computed `getStatus` fields.
- `persistMatch(supabase, reconId, match)` — `upsert` keyed on `(session_id, bank_transaction_id, target_type, target_id)`. Stores `pass`, `confidence`, `bank_entry_ids[]`, `gl_entry_ids[]`, `label_he/en`, `suspicious`, `undone`. Then `update bank_transactions set reconciled=NOT undone` for each integer-id bank entry.
- `persistAdjustment(supabase, reconId, adj)` — `upsert` into `reconciliation_adjustments`, keyed on `(session_id, engine_id)`.
- `persistAudit(supabase, reconId, audit)` — `insert` into `reconciliation_audit` (append-only).

---

## 4. Persistence Across Requests

Three guarantees:

1. **Write-through.** Every engine mutation in a route handler is followed by `persistSession + persistMatch/Adjustment/Audit` within the same request. On persist failure the route returns 500 and engine state rolls back via `undoMatch` (best-effort; no SQL transaction across calls).
2. **Cold-start hydrate.** `GET /api/finance/reconciliation/:id*` and every mutating route first calls `await hydrateSession(supabase, reconId)` before delegating to the engine. If the engine map already has the id, no-op.
3. **Active-session lock.** `POST /start` rejects with 409 when a `draft|in_progress` session for `(bank_account_id, period_from, period_to)` already exists — keeps the engine map and DB in lockstep.

The engine's never-delete rule (`undoMatch` flips a flag, doesn't splice) maps cleanly to the `undone BOOLEAN` columns. No `DELETE` statements in any persistence call — `ON DELETE CASCADE` is reserved for the session-header drop case.

---

## 5. UI Wiring — `BankReconciliation.tsx`

**File to edit:** `payroll-autonomous/src/components/BankReconciliation.tsx`

Replace hardcoded `BANK_TXS` / `SYSTEM_TXS` constants and the single `fetch('/api/finance/reconciliation/close')` with:

```tsx
const [reconId, setReconId]     = useState<string | null>(null);
const [bankTxs, setBankTxs]     = useState<BankTx[]>([]);
const [systemTxs, setSystemTxs] = useState<SystemTx[]>([]);
const [stats, setStats]         = useState<{matched:number; unmatched:number; suspicious:number} | null>(null);

// Step 1 — start session + import
const handleUpload = async (file: File, accountId: string) => {
  const text = await file.text();
  const { recon_id } = await fetch('/api/finance/reconciliation/start', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ bank_account_id: accountId, period: pickPeriod() }),
  }).then(r => r.json());
  setReconId(recon_id);
  await fetch(`/api/finance/reconciliation/${recon_id}/import`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: text, format: 'auto' }),
  });
  setStep(2);
};

// Step 2 — auto-match + render
useEffect(() => {
  if (step !== 2 || !reconId) return;
  fetch(`/api/finance/reconciliation/${reconId}/auto-match`, { method: 'POST' })
    .then(r => r.json())
    .then(d => { setStats(d); return fetch(`/api/finance/reconciliation/${reconId}`).then(r => r.json()); })
    .then(snap => { setBankTxs(snap.bank_entries); setSystemTxs(snap.gl_entries); });
}, [step, reconId]);

const handleManualMatch = async (bankId: string, glId: string) => {
  await fetch(`/api/finance/reconciliation/${reconId}/manual-match`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ bankEntryId: bankId, glEntryId: glId }),
  });
  const snap = await fetch(`/api/finance/reconciliation/${reconId}`).then(r => r.json());
  setBankTxs(snap.bank_entries); setSystemTxs(snap.gl_entries);
};

// Step 3 — complete
const handleClose = async () => {
  setClosing(true);
  const r = await fetch(`/api/finance/reconciliation/${reconId}/complete`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId: currentUser.id }),
  });
  if (r.ok) setClosed(true);
  setClosing(false);
};
```

Step-3 status cards bind to `stats.matched`, `stats.unmatched`, `stats.suspicious`, `getStatus.is_balanced`, `getStatus.difference`.

UI keeps its existing 3-step layout, badges, and Hebrew labels — `label_he` from each engine match drives the per-row tooltip. The `ignored` set is removed; users instead `POST /:id/adjustment` with `kind: 'BANK_FEE' | 'INTEREST' | 'OTHER'` to flush an unmatched line.

---

## 6. Test & Acceptance

| Test | Verifies |
|------|----------|
| `bank-routes.test.js` (extend) — start → import → auto-match → restart → status survives | hydrate path |
| `recon-persistence.test.js` (new) — re-running auto-match doesn't duplicate matches | upsert idempotency |
| `bank-reconciliation.test.js` (existing engine tests) | regression |
| `qa-03-bank-upload.test.js` — chain `/api/bank/accounts/:id/import` → `/api/finance/reconciliation/start` | end-to-end |
| Frontend smoke — drive `BankReconciliation.tsx` through the 3 steps with mocked fetch | UI wiring |

**Acceptance criteria:**

1. `npm test --workspace onyx-procurement -- bank` is green.
2. After a `node server.js` restart, `GET /api/finance/reconciliation/:id/status` returns the same `matched_count` / `difference` as before the restart.
3. `BankReconciliation.tsx` no longer references `BANK_TXS` or `SYSTEM_TXS` constants.
4. `bank-routes.js` no longer imports `./matcher`.
5. Migration 008 applies cleanly on top of 007 and seeds a row in `schema_migrations`.
6. Engine never-delete rule preserved: `undoMatch` sets `undone=true`; no `DELETE FROM reconciliation_matches` is ever issued.

---

## 7. Files Touched

| Action | Path |
|--------|------|
| ADD | `onyx-procurement/supabase/migrations/008-bank-reconciliation-sessions.sql` |
| ADD | `onyx-procurement/src/bank/recon-persistence.js` |
| EDIT | `onyx-procurement/src/bank/bank-routes.js` (drop matcher import; mount `/api/finance/reconciliation/*`; rewrite `auto-reconcile`) |
| EDIT | `payroll-autonomous/src/components/BankReconciliation.tsx` (replace constants with API calls) |
| MARK | `onyx-procurement/src/bank/matcher.js` (deprecation banner; keep file) |
| ADD | `onyx-procurement/test/recon-persistence.test.js` |

---

**End of report — AGENT-227.**
