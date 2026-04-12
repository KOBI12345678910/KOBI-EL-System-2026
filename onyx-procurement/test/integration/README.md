# Cross-Project Integration Tests

**Author:** Agent 46 — 2026-04-11
**Location:** `onyx-procurement/test/integration/cross-project.test.js`

## What this covers

End-to-end contract tests that verify the four projects of the Techno-Kol
Uzi mega-ERP behave as **one system**, not four loose services:

| Project | Prod port | Role |
|---|---|---|
| `onyx-procurement` | `3100` | ERP core, payroll PDFs, supplier invoicing, P&L |
| `techno-kol-ops` | `3200` (+ client `5174`) | Ops tickets, PO board, auth issuer |
| `onyx-ai` | `3300` | LLM gateway, event store |
| `payroll-autonomous` | `5173` | Employee self-service client |

The suite spins up an in-process mini-app for each service (routes + storage),
then replaces the cross-project HTTP layer with a `mockFetch` router that
dispatches by URL origin. Nothing opens a socket, nothing talks to Supabase,
nothing requires any of the dev servers to be running.

## Scenarios

1. **Procurement → Payroll.** A supplier invoice posted with category
   `salaries_other` must auto-generate a `pnl_entries` row of type
   `expense_deduction` for that period. A control case with category
   `materials` must NOT generate a deduction.

2. **Ops → Procurement.** A ticket with `type = 'purchase_request'` must
   cause ops to call `POST /api/procurement/po` (with the caller's JWT)
   and attach the resulting draft PO id back to the ticket. A ticket of
   any other type must not create a PO.

3. **Onyx-AI → Procurement.** An AI query of "כמה הוצאנו על ברזל החודש"
   must hit the read-only `GET /api/procurement/expenses/summary` endpoint,
   filter by period and `material_key = 'iron'`, and return the exact
   numeric total in a Hebrew answer. A token that lacks the
   `procurement:read` scope must be refused upstream.

4. **Procurement → Onyx-AI.** Every supplier invoice creation must publish
   an `invoice.created` event into the onyx-ai event store, with the
   correct service attribution, subject, `occurred_at` and payload.

5. **Auth federation.** A JWT minted by `techno-kol-ops` must be accepted
   by `onyx-procurement` because both services share one signing secret.
   Tampered, wrong-secret, and expired tokens must all be rejected with
   `401`.

6. **PDF pipeline.** The wage-slip PDF generated inside procurement must
   be served to the ops client via a signed URL that includes `exp` and
   `sig` query parameters. Expired URLs and URLs with a tampered sig must
   return `403`. A call to the signing endpoint without a JWT must return
   `401`.

## How to run

```bash
cd onyx-procurement
node --test test/integration/cross-project.test.js
```

Expected output (example):

```
ok 1 - Scenario 1 — Procurement → Payroll: salaries_other category flows into P&L deduction
ok 2 - Scenario 2 — Ops → Procurement: purchase_request ticket creates a draft PO
ok 3 - Scenario 3 — Onyx-AI → Procurement: NL query about iron spend uses read-only API
ok 4 - Scenario 4 — Procurement → Onyx-AI: invoice.created events land in event store
ok 5 - Scenario 5 — Auth federation: techno-kol-ops JWT is accepted by onyx-procurement
ok 6 - Scenario 6 — PDF pipeline: wage slip PDF served to ops client via signed URL with expiration
# tests 6
# pass 6
# fail 0
```

The whole suite runs in well under one second and requires **no network,
no Supabase, no dev servers, and no env vars**.

## Design notes

- **Offline is non-negotiable.** No `fetch()` against real hosts and no
  TCP sockets. All cross-project traffic goes through a purely in-memory
  URL router that dispatches to the right mini-app.
- **Shared helpers.** The suite reuses `test/helpers/mock-supabase.js`
  (the existing Agent-15 test harness) so mutations are visible through
  the same fluent builder as real code paths. It does **not** modify
  that helper.
- **Injected clock.** JWT verification and signed-URL expiration both
  accept an injected `now()` so "time travel" tests (e.g. expiring a
  signed URL) can be deterministic without touching `Date.now()`.
- **Dependency-free JWT.** The JWT (HS256) is implemented via
  `node:crypto`. Signed URLs use an HMAC-SHA256 over `path|expSec`.
  No libraries pulled in, so the suite keeps working even if
  `node_modules` drifts.
- **Self-contained.** The only requires are `node:test`,
  `node:assert/strict`, `node:crypto`, and the existing
  `test/helpers/mock-supabase.js`. Nothing in production code is
  imported or mutated.

## Adding a new scenario

1. Extend `buildWorld()` or the relevant mini-app (`makeProcurementApp`,
   `makeOpsApp`, `makeAiApp`, `makePayrollClientApp`) with the new route.
2. Add a `test(...)` block that walks the flow end-to-end through
   `world.mockFetch(...)`.
3. Run `node --test test/integration/cross-project.test.js` and commit
   once it's green.

The router ONLY knows about these four origins:
`onyx-procurement:3100`, `techno-kol-ops:3200`,
`onyx-ai:3300`, `payroll-autonomous:5173`. If you add a fifth service,
extend `makeMockFetchRouter` to register it.

## Bugs found during authoring

See the Agent-46 delivery report. Three defects were discovered while
writing the tests, all of them in the test harness itself (not in
production code), but each one pointed at a real integration concern:

1. **Clock skew in JWT verification.** The first draft of `verifyJwt`
   used the real wall clock, which caused tokens minted from a mocked
   "business now" to be rejected as expired whenever the mock clock
   differed from the test runner's wall clock. Fix: inject `nowSec`
   into `verifyJwt` and thread it through `requireAuth`. Worth checking
   whether production procurement's JWT middleware is also using a
   hard-coded clock — if yes, it will drift during DST or when the
   host NTP is off.

2. **Signed URL hostname missed the port.** The signed wage-slip URL
   was emitted as `http://onyx-procurement/files/...` without the
   `3100` port, which the mock-fetch router couldn't route. The same
   would happen in production if the storage service is reached via
   a bare hostname behind a reverse proxy while clients expect an
   explicit port.

3. **Category metadata silently dropped.** The procurement invoice
   handler originally copied only a fixed subset of fields into the
   persisted row, so `material_key` / `tags` vanished. The AI query
   then filtered on those missing fields and returned zero results.
   A real procurement ingest endpoint should either whitelist-and-
   validate, or spread the payload — silent field loss is a
   classic integration bug.
