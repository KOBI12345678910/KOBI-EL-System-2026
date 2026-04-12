# AG-X23 — Contract Management + E-Signature Flow
**Agent:** X-23 | **Swarm:** 3B | **Project:** Techno-Kol Uzi mega-ERP
**Date:** 2026-04-11
**Status:** PASS — 24/24 tests green

---

## 1. Scope

A zero-dependency contract-management subsystem for the Techno-Kol Uzi
mega-ERP. Handles the full contract life cycle for the six standard
contract types the group uses, plus a self-contained e-signature engine
that produces Israeli Electronic Signature Law 2001 (חוק חתימה
אלקטרונית תשס"א-2001) tier-(2) "secured" signature records with a
tamper-evident audit trail.

Built on top of `node:crypto` only. No external libs (no DocuSign SDK,
no PDF libs, no PKI frameworks), no DB dependency (pluggable adapter
with in-memory fallback).

**Delivered files**
- `onyx-procurement/src/contracts/contract-manager.js` — the manager (~650 LOC)
- `onyx-procurement/src/contracts/esign.js` — the signature engine (~490 LOC)
- `test/payroll/contract-manager.test.js` — 24 tests (~480 LOC)
- `_qa-reports/AG-X23-contract-management.md` — this report

**RULES respected**
- Zero external dependencies (only `node:crypto`)
- Hebrew RTL bilingual (every status, event, and template carries `he` + `en`
  labels; templates are Hebrew-primary with legally material Hebrew body text)
- Israeli contract-law aware (LEGAL_REFS constant + per-template `legal_ref`
  foreign keys into the eight anchoring laws — see §6)
- NEVER DELETE invariant — cancel / terminate / expire are append-only
  status flips with audit + version snapshots; no row is ever dropped
- Real code, fully exercised by 24 unit tests

---

## 2. Public API

```js
const cm = require('./src/contracts/contract-manager.js');

// Primary API per spec
cm.createContract(templateKey, fields)         // → draftId
cm.sendForSigning(draftId, signers, opts?)     // → { requestId, tokens[] }
cm.recordSignature(token, signatureData)       // → { ok, signature, request_status }
cm.verifyContract(id)                          // → { valid, signers_count, hash_match }
cm.listExpiring(days?)                         // → flat list OR {within_30, within_60, within_90, overdue}
cm.renewContract(id, newExpiry, opts?)         // → void

// Secondary helpers
cm.addAmendment(id, body, actor?)              // → amendmentId
cm.cancelContract(id, reason, actor?)          // → void (append-only)
cm.terminateContract(id, reason, actor?)       // → void (append-only)
cm.sweepExpired(asOf?)                         // → number of flipped contracts
cm.getContract(id)                             // → deep clone or null
cm.listContracts(filter?)                      // → array of deep clones
cm.getVersionHistory(id)                       // → snapshot array

// Templates
cm.listTemplates()                             // → [{ key, type, title_he, ... }]
cm.getTemplate(key)
cm.registerTemplate(key, template)             // extensibility hook
cm.applyTemplate(key, fields)                  // → {title_he, body_he, warnings, missing_required}

// Low-level
cm.computeDocumentHash(contract)               // sha256 of canonical doc
cm.resetStore()
cm.setPersistenceAdapter(adapter)
```

```js
const esign = require('./src/contracts/esign.js');

esign.createRequest(contract, signers, opts?)   // → { requestId, tokens[] }
esign.recordSignature(token, signatureData)     // → { ok, signature, reason? }
esign.verifyRequest(requestId, opts?)           // → full integrity report
esign.getRequest(requestId)
esign.listRequests()
esign.cancelRequest(requestId, reason?)
esign.markLinkOpened(token, meta?)              // audit only, no state change

// Crypto helpers
esign.sha256(str)
esign.hmac(secret, str)
esign.canonicaliseDocument(contract)
esign.canonicalJson(value)
esign.generateToken(requestId, signerIdx)

// Constants
esign.SIG_MODE          // { SEQUENTIAL, PARALLEL }
esign.REQUEST_STATUS    // { PENDING, PARTIAL, COMPLETED, EXPIRED, CANCELLED }
esign.SIGNATURE_STATUS  // { PENDING, SIGNED, DECLINED, REVOKED }
esign.AUDIT_EVENT
esign.EVENT_LABELS      // bilingual he/en
esign.DEFAULT_TTL_MS    // 14 days
```

---

## 3. Contract types + state machine

Six contract types exposed via `CONTRACT_TYPE`:

| Code | Hebrew | English | Default template key |
|---|---|---|---|
| `employment` | חוזה עבודה (עובד) | Employment Contract | `employment-monthly-he`, `employment-hourly-he` |
| `supplier`   | הסכם ספק            | Supplier Agreement  | `supplier-standard-he` |
| `client`     | הסכם לקוח / SOW     | Client Agreement / SOW | `client-sow-he` |
| `lease`      | חוזה שכירות         | Lease Agreement     | `lease-residential-he` |
| `nda`        | הסכם סודיות         | Non-Disclosure Agreement | `nda-mutual-he` |
| `service`    | הסכם שירות (SLA)    | Service Level Agreement  | `sla-service-he` |

**Status lifecycle (STATUS enum):**

```
draft ──sendForSigning──▶ sent
                          │
                          ├── one signer ──▶ partial
                          │
                          └── all signers ──▶ signed ──(effective_date passed)──▶ active
                                                                                    │
                                                                                    ├── renewContract ──▶ renewed ──▶ active
                                                                                    ├── expiry passed ──▶ expired
                                                                                    ├── terminateContract ──▶ terminated
                                                                                    └── cancelContract ──▶ cancelled
```

All transitions are append-only. `version_history[]` gets a snapshot
before every mutation; `audit_trail[]` grows monotonically.

---

## 4. Contract envelope (fields per spec)

```js
{
  id:                'ctr_<16hex>',
  type:              'employment' | 'supplier' | ...,
  type_label_he:     'חוזה עבודה',
  type_label_en:     'Employment Contract',
  template_key:      'employment-monthly-he',
  title:             string,
  title_en:          string,
  body_he:           string,   // populated template body
  body_en:           string,   // optional
  parties: [
    { name, id_or_hp, role, email, _id_shape_ok }
  ],
  signed_at:         ISO string | null,
  effective_date:    ISO string | null,
  expiry_date:       ISO string | null,
  auto_renew:        boolean,
  renewal_notice_days: number,  // defaults per template (30/60/…)
  value:             number,
  currency:          'ILS',
  status:            STATUS.*,
  status_label_he:   'פעיל',
  status_label_en:   'Active',
  document_hash:     '<64 hex sha-256>',
  signatures:        [ {signer_index, typed_name, drawn_png_b64,
                        drawn_png_sha256, ip, user_agent, geolocation,
                        at, document_hash_at_sign, document_hash_match,
                        sig_hmac, signer_name, signer_id_or_hp, signer_role} ],
  signature_request_id: 'req_<20hex>' | null,
  amendments: [
    { id, at, actor, title, description, delta, effective_date, hash }
  ],
  version_history: [
    { version, at, reason, document: {...frozen snapshot} }
  ],
  warnings:          string[],         // unfilled placeholders
  missing_required:  string[],         // template-required fields missing
  legal_ref:         'חוק חוזה עבודה אישי (תשל"ז-1977)',
  created_at, updated_at, created_by,
  cancelled_at, cancel_reason,
  audit_trail: [ { event, at, actor, ...payload } ],
}
```

Every field the spec asked for is present. `document_hash` is a SHA-256 of
the canonicalised (key-sorted, mutable-fields-stripped) document.

---

## 5. E-signature flow

### 5.1 Flow

1. `createContract(template, fields)` → returns draftId; contract status
   is `draft`; signatures `[]`; document_hash computed.
2. `sendForSigning(draftId, signers, { mode })` calls
   `esign.createRequest(contract, signers, { mode })`:
   - Generates `req_<20hex>` request id.
   - Mints a unique HMAC-bound token per signer. Token format:
     `<32 hex random> . <16 hex HMAC>` where HMAC is over
     `"<requestId>:<signerIndex>:<random>"` with a process-level secret
     (env-overridable via `ESIGN_HMAC_SECRET`).
   - Hashes the contract document (canonical form, see §5.2) with SHA-256.
   - Creates an audit trail with `REQUEST_CREATED` + per-signer `TOKEN_ISSUED`.
   - Default TTL = 14 days (commercial practice, fits the "reasonable
     time" doctrine of חוק החוזים §8).
3. The signer receives a link `/esign/sign/<token>`. The UI collects:
   - Typed name
   - Canvas-drawn signature as base64 PNG (stub in tests)
   - IP, user-agent, optional geolocation
4. `recordSignature(token, data)`:
   - Verifies HMAC binding (timing-safe compare).
   - Checks expiry, cancellation, already-signed, out-of-order.
   - Computes fresh SHA-256 of the document at time of signing.
   - Stores a signature blob with `sig_hmac` = HMAC over the blob
     contents — tamper-evident.
   - Appends `SIGNATURE_RECORDED` audit entry.
   - Flips request status to `PARTIAL` or `COMPLETED`.
5. When all signers have signed, the contract status flips to `SIGNED`
   (and automatically to `ACTIVE` if `effective_date` is in the past or
   `null`).

### 5.2 Canonicalisation for hashing

`esign.canonicaliseDocument(contract)` produces a deterministic JSON
string by:
- Sorting object keys recursively
- Preserving array order (semantic ordering)
- Omitting mutable life-cycle fields: `status*`, `signatures`,
  `signature_request_id`, `signed_at`, `audit_trail`, `document_hash`,
  `updated_at`, `created_at`, `amendments`, `version_history`,
  `cancelled_at`, `cancel_reason`, `warnings`, `missing_required`.

The result is the legally-material "what was agreed upon" fingerprint:
id, type, title, body, parties, effective/expiry dates, value, auto_renew,
renewal_notice_days, template_key, legal_ref.

Because status and signatures sit outside the hash, verifyContract can
always re-hash the live contract and compare to `document_hash` at rest.

### 5.3 Signing modes

- **Parallel (`parallel`)** — all signers may sign in any order.
- **Sequential (`sequential`)** — signers must sign in `order`. An
  attempt by signer N where signer <N has not yet signed returns
  `{ ok: false, reason: { code: 'OUT_OF_ORDER' } }`.

---

## 6. Israeli contract-law posture

`LEGAL_REFS` anchors each template to the relevant statute:

| Key | Law |
|---|---|
| `GENERAL`    | חוק החוזים (חלק כללי) תשל"ג-1973 |
| `REMEDIES`   | חוק החוזים (תרופות) תשל"א-1970 |
| `LEASE`      | חוק השכירות והשאילה תשל"א-1971 |
| `TENANT`     | חוק הגנת הדייר (נוסח משולב) תשל"ב-1972 |
| `EMP_NOTICE` | חוק הודעה לעובד תשס"ב-2002 |
| `EMP_CONTR`  | חוק חוזה עבודה אישי (תשל"ז-1977) |
| `WORK_HRS`   | חוק שעות עבודה ומנוחה תשי"א-1951 |
| `ESIGN`      | חוק חתימה אלקטרונית תשס"א-2001 |

Electronic Signature Law 2001 distinguishes three tiers:

1. **חתימה אלקטרונית** — simple electronic signature
2. **חתימה אלקטרונית מאובטחת** — secured (HMAC / proprietary PKI)
3. **חתימה אלקטרונית מאושרת** — certified (licensed CA, smart-card)

This module implements tiers (1) and (2): a simple-but-secured click-
to-sign flow with HMAC-backed tokens, SHA-256 document hashing, and a
tamper-evident audit trail. It is NOT a licensed CA and does NOT produce
tier-(3) certified signatures — callers who need that must plug in a
licensed provider and wrap the resulting certificate blob.

---

## 7. Feature matrix

| Spec feature | Status | Where |
|---|---|---|
| Template library with placeholders       | PASS | `DEFAULT_TEMPLATES` + `applyTemplate()` |
| Populate template → draft contract       | PASS | `createContract()` |
| Track amendments (addendums)             | PASS | `addAmendment()`, `contract.amendments[]`, each with own sha-256 |
| Signature workflow (draft→sent→signed→active→expired) | PASS | `STATUS` enum + `sendForSigning / recordSignature / sweepExpired` |
| Expiry alerts (30/60/90 days out)        | PASS | `listExpiring()` grouped + `listExpiring(n)` flat |
| Auto-renewal with notice period          | PASS | `auto_renew`, `renewal_notice_days`, `needs_action` flag on expiring entries |
| Cancellation tracking                    | PASS | `cancelContract()` — append-only, keeps body + parties + history |
| Version history                          | PASS | `version_history[]` snapshot on every mutation |
| E-sign unique token                      | PASS | `esign.generateToken()` (HMAC-bound) |
| Signer types name + draws signature      | PASS | `recordSignature({ typed_name, drawn_png_b64 })` |
| Capture IP / UA / timestamp              | PASS | stored in signature blob + audit trail |
| SHA-256 document hash at time of signing | PASS | `signature.document_hash_at_sign` + `document_hash_match` |
| Multi-party sequential OR parallel       | PASS | `opts.mode: 'sequential' \| 'parallel'` |
| Audit trail                              | PASS | Bilingual labels via `EVENT_LABELS` |

**Exports per spec**

| Spec export | Implementation |
|---|---|
| `createContract(template, fields) → draftId` | `cm.createContract` |
| `sendForSigning(draftId, signers[]) → tokens` | `cm.sendForSigning` |
| `recordSignature(token, signatureData) → void` | `cm.recordSignature` (returns result, `void` in spec spirit) |
| `verifyContract(id) → {valid, signers_count, hash_match}` | `cm.verifyContract` |
| `listExpiring(days) → contracts` | `cm.listExpiring` |
| `renewContract(id, newExpiry) → void` | `cm.renewContract` |

---

## 8. Test report

**Runner:** `node --test test/payroll/contract-manager.test.js`

```
ℹ tests 24
ℹ pass 24
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ duration_ms ~178
```

**Case list (24, ≥ 15 required)**

| # | Case | Covers |
|---|---|---|
| 01 | Template library exposes all six required contract types | Template completeness |
| 02 | applyTemplate substitutes placeholders + reports warnings | Template engine |
| 03 | createContract for all six contract types produces draft ids | Core creation |
| 04 | createContract flags missing required fields | Validation UX |
| 05 | Document hash is stable under property reordering | Canonicalisation |
| 06 | Document hash changes when a semantic field changes | Hash sensitivity |
| 07 | sendForSigning parallel mode issues tokens for every signer | Signing plumbing |
| 08 | recordSignature captures IP, UA, typed_name, and doc hash | Metadata capture |
| 09 | Sequential mode — second signer cannot sign before first | Sequential enforcement |
| 10 | Full lifecycle flips contract to ACTIVE after all sign | State machine |
| 11 | verifyContract returns hash_match + signer counts | Verify API |
| 12 | Tamper detection — forging the contract breaks hash_match | Anti-tamper |
| 13 | listExpiring() without arg returns 30/60/90 + overdue | Bracket grouping |
| 14 | listExpiring(n) returns flat list filtered by days | Numeric filter |
| 15 | renewContract extends expiry, snapshots version, audits | Renewal flow |
| 16 | addAmendment appends immutable addendum with hash | Amendments |
| 17 | cancelContract is append-only, keeps data retrievable | NEVER DELETE |
| 18 | Version history accumulates snapshots across events | Version history |
| 19 | Signature request with expired TTL rejects late sigs | Expiry window |
| 20 | Signing the same token twice is rejected | Double-sign guard |
| 21 | Tampered token is rejected by HMAC binding | Token integrity |
| 22 | Contracts inside renewal-notice window flag needs_action | Auto-renew UX |
| 23 | sweepExpired moves past-due contracts to EXPIRED | Batch sweep |
| 24 | E-sign audit trail labels are bilingual (Hebrew + English) | I18n |

---

## 9. Security + threat model

| Attack | Mitigation |
|---|---|
| Stolen token replay across requests | HMAC binds token to `(requestId, signerIndex, random)` — cannot be re-used against a different request even if the attacker knows other request IDs |
| Token forgery | HMAC with 128-bit truncation; `_verifyToken` uses timing-safe compare |
| Document mutation after signing | `document_hash_at_sign` captured per signature; `verifyContract()` recomputes live hash and compares to stored hash |
| Signature blob swap in the store | Per-signature `sig_hmac` binds typed_name + timestamp + IP + UA + hash; `verifyRequest()` re-computes and compares |
| Double-signing | `SIGNER_STATUS === SIGNED` guard + idempotent-safe rejection |
| Out-of-order signing | Sequential mode walks prior signers and rejects until all are SIGNED |
| TTL attack / stale tokens | Hard-coded 14-day default; `REQUEST_EXPIRED` audit entry on first expired access |
| Store-level deletion | There is no deletion path — cancel/terminate are status flips |

**Known limitations**
- Not a tier-(3) "certified" signature under Israeli law — callers who
  need that must wrap a licensed-CA certificate and attach it as an
  extra signature field (the module tolerates arbitrary signer data).
- `ESIGN_HMAC_SECRET` should be sourced from a KMS in production via a
  persistence adapter that overrides `MODULE_SECRET` or proxies through
  an HSM. The default is a per-process random key.

---

## 10. Dependency audit

```
node_modules:  EMPTY  (zero external deps)
node built-ins used:  node:crypto  (sha256, hmac, randomBytes)
```

---

## 11. Files + metrics

| File | Path | LOC |
|---|---|---|
| Contract manager | `onyx-procurement/src/contracts/contract-manager.js` | ~650 |
| E-sign engine    | `onyx-procurement/src/contracts/esign.js` | ~490 |
| Tests            | `test/payroll/contract-manager.test.js` | ~480 |
| This report      | `_qa-reports/AG-X23-contract-management.md` | — |

**Final status:** PASS, 24/24 green, 0 deps, append-only invariant
preserved, Hebrew/English bilingual throughout, Israeli contract-law
anchors wired into every template.
