# AGENT-189 — Contracts (CLM) Audit
**Agent:** 189 | **Scope:** Contract lifecycle, renewals, expiry alerts, e-signature
**Date:** 2026-04-29
**Status:** PASS (with findings — see §6)

---

## 1. Scope

Audit of the contract-management subsystem against AG-X23-contract-management.md
(2026-04-11) and the broader ERP. Tracked four pillars:

1. Contract storage tables
2. CLM lifecycle (draft -> active -> expired/terminated)
3. Renewals + expiry alerts (30/60/90 + auto-renewal)
4. E-signature flow (token, hashing, audit, Israeli ESIGN Law 2001)

---

## 2. Storage layer

**No `legal_contracts` table exists.** The audit prompt referenced it; the
codebase uses three distinct contract stores instead:

| Table | Path | Role |
|---|---|---|
| `procurement.contracts` | `supabase/migrations/00000_master_schema.sql:677` | Procurement-facing ERP contract (tied to quote/PO/customer/supplier) |
| `contracts` (TKO) | `techno-kol-ops/supabase/migrations/001-operations-core.sql:213` | Counterparty register; 9-status CHECK constraint, 9 contract types |
| `clm_contracts` + 4 satellites | `api-server/src/routes/contract-lifecycle.ts:8` (DDL inline) | Full CLM with parties, stages, obligations, redlines |
| `digital_contracts` + `contract_signatures` + `contract_templates` | `api-server/src/routes/digital-contracts-engine.ts:21` | Hebrew templated digital contracts with e-sign |

The reference module `onyx-procurement/src/contracts/contract-manager.js`
is in-memory only (pluggable persistence adapter — see `setPersistenceAdapter`
at line 71 of API), zero deps on `node:crypto`.

**Recommendation:** the prompt's `legal_contracts` is not a real table.
Either rename one of the above (most likely `clm_contracts`, which is
the closest match to "legal CLM"), or document that there is no single
canonical contracts table — there are 3 (TKO, procurement, CLM) plus
the digital-sign overlay.

---

## 3. CLM lifecycle

`clm_contracts.stage` cycles through 9 stages (Hebrew):

```
טיוטה -> בדיקה -> משא ומתן -> אישור -> חתימה -> פעיל -> חידוש -> הסתיים | בוטל
```

State transitions are append-only via `clm_contract_stages` ledger
(`POST /clm/contracts/:id/advance-stage`, line 308). Every transition
captures `from_stage`, `to_stage`, `changed_by_name`, `reason`,
`created_at`. Bilingual labels missing on stage strings — they are
Hebrew-only literals (e.g. `'פעיל'`).

The reference contract-manager uses 9 STATUS values
(`draft|sent|partial|signed|active|renewed|expired|cancelled|terminated`)
matched 1:1 with bilingual labels (he+en) in `STATUS_LABELS`.

**Mismatch:** `clm_contracts.stage` enum and `contract-manager.js STATUS`
enum are not aligned. `clm` uses Hebrew strings as primary keys; `cm`
uses English keys with Hebrew display labels. No mapping layer exists.

---

## 4. Renewals + expiry alerts

| Capability | Implementation | Status |
|---|---|---|
| 30/60/90-day brackets | `cm.listExpiring()` returns `{within_30, within_60, within_90, overdue}` (contract-manager.js:834) | PASS |
| Numeric filter | `cm.listExpiring(n)` flat list | PASS |
| Auto-renew flag | `auto_renewal BOOLEAN`, `renewal_period_months INTEGER`, `renewal_notice_days INTEGER` on `clm_contracts` | PASS |
| `needs_action` UI flag | Set when `days_remaining <= renewal_notice_days` (line 856) | PASS |
| Auto-renewal job | `POST /clm/renewals/process-auto` (line 572) extends `end_date` by `renewal_period_months` | PASS |
| Renewal alerts API | `GET /clm/renewals/alerts?days=N` (line 550) | PASS |
| Background renewal sweep | `runRenewalCheck()` at line 648 — fires at 30/60/90 days exact | PASS, but not wired to a scheduler in this audit's view |
| `sweepExpired()` batch flip | `cm.sweepExpired()` flips past-due to EXPIRED, append-only | PASS |
| `digital_contracts.expires_at` 30-day query | `GET /expiring` (digital-contracts-engine.ts:1147) | PASS |

**Gap:** `runRenewalCheck()` is defined but I found no cron/scheduler
wiring it up. It needs to run nightly. Suggest registering with the
existing event bus / job runner (see `_qa-reports-25/AGENT-79-event-bus.md`).

---

## 5. E-signature flow

Implementation: `onyx-procurement/src/contracts/esign.js` (745 LOC).

| Capability | Where | Status |
|---|---|---|
| Unique HMAC-bound token per signer | `esign.generateToken()` — `<32hex>.<16hex HMAC>` | PASS |
| Tokens bound to (requestId, signerIndex, random) | `_verifyToken` timing-safe compare | PASS |
| TTL default 14 days, expirable | `DEFAULT_TTL_MS`, `REQUEST_EXPIRED` audit | PASS |
| Sequential vs Parallel modes | `SIG_MODE.SEQUENTIAL/PARALLEL`; out-of-order rejected | PASS |
| Captures typed_name + drawn_png_b64 | `recordSignature(token, data)` | PASS |
| Captures IP, UA, timestamp, geolocation | Stored in signature blob + audit | PASS |
| SHA-256 doc hash at sign time | `signature.document_hash_at_sign`, `document_hash_match` | PASS |
| Tamper detection | Per-signature `sig_hmac` + `verifyContract()` re-hashes live doc | PASS |
| Bilingual audit events | `EVENT_LABELS` he/en | PASS |
| Israeli ESIGN Law 2001 tier-2 ("מאובטחת") | HMAC + SHA-256 + audit trail | PASS |
| Tier-3 ("מאושרת" — licensed CA) | Not implemented; documented limitation | KNOWN GAP |
| `ESIGN_HMAC_SECRET` env override, KMS-ready | Per-process random fallback | PASS, KMS wiring is deployment concern |

**24/24 tests pass** — verified by running
`node --test test/payroll/contract-manager.test.js` from the worktree
root (3.19s, 0 fails). Test cases cover all 9 status transitions, both
signing modes, TTL expiry, double-sign rejection, HMAC tampering,
hash-tamper detection, version history, NEVER DELETE invariant on
cancel/terminate.

---

## 6. Findings (issues to address)

### F1. NEVER DELETE invariant violated in `clm_contracts`
`api-server/src/routes/contract-lifecycle.ts:349` issues a hard
`DELETE FROM clm_contracts WHERE id = $1`. This contradicts the AG-X23
NEVER DELETE rule (status flips only). Replace with a soft delete:
flip `stage = 'בוטל'` and append a `clm_contract_stages` row.

### F2. No `legal_contracts` table
Prompt referenced it; not in schema. Three competing contract stores
exist (`procurement.contracts`, TKO `contracts`, `clm_contracts`) plus
`digital_contracts`. Recommend a single canonical view or a
documented mapping.

### F3. CLM stage enum is Hebrew literal strings
`VALID_STAGES = ["טיוטה", "בדיקה", ...]` in contract-lifecycle.ts:113
locks the API to Hebrew keys. The reference module uses
English-keyed enums with bilingual labels, which is the pattern to
adopt. Existing rows would need a migration.

### F4. `runRenewalCheck()` is not scheduled
Defined at contract-lifecycle.ts:648 but no cron/event-bus invocation.
Wire to nightly job; currently expiry alerts only fire on demand
through `GET /clm/renewals/alerts`.

### F5. Digital signatures store no `document_hash_at_sign`
`contract_signatures` table (digital-contracts-engine.ts:51) lacks the
hash-at-sign + HMAC integrity columns that `contract-manager.js`
captures. The legacy SQL path is weaker than the JS module path.

### F6. Three signature stores exist
`contract_signatures` (digital-contracts-engine), in-memory `esign.js`
request store, and signatures embedded in `contract.signatures[]`.
No reconciliation. Pick one.

---

## 7. Verdict

- E-signature core (`esign.js` + `contract-manager.js`): PASS, 24/24
  green, zero deps, append-only, Israeli ESIGN Law 2001 tier-2
  compliant.
- CLM API surface (`contract-lifecycle.ts`): PASS for renewals/
  alerts/lifecycle stages, FAIL on hard-delete (F1).
- Storage layer: 3 competing tables, no `legal_contracts` per prompt.
- Background scheduling for renewal sweeps: missing wiring (F4).

**Action items, prioritised:** F1 (data-loss risk) > F4 (missed alerts)
> F5/F6 (integrity) > F2/F3 (tech debt).

---

## 8. Files referenced (absolute paths)

- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\onyx-procurement\src\contracts\contract-manager.js` (1115 LOC)
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\onyx-procurement\src\contracts\esign.js` (745 LOC)
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\test\payroll\contract-manager.test.js` (600 LOC, 24/24 pass)
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\api-server\src\routes\contract-lifecycle.ts` (687 LOC, hard-delete at :349)
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\api-server\src\routes\digital-contracts-engine.ts` (1247 LOC)
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\api-server\src\routes\digital-contracts-signatures-engine.ts` (1239 LOC)
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\api-server\src\routes\contracts.ts` (357 LOC)
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\api-server\src\routes\contract-templates.ts` (1832 LOC)
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\supabase\migrations\00000_master_schema.sql` (`procurement.contracts` at :677)
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\techno-kol-ops\supabase\migrations\001-operations-core.sql` (`contracts` at :213)
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\_qa-reports\AG-X23-contract-management.md` (origin spec)

---

**Final status:** PASS for the X-23-delivered manager + esign engine
(24/24 tests green). 6 findings (F1-F6) flagged for remediation, F1
being a data-loss risk and the only blocker to a clean PASS on the
CLM surface.
