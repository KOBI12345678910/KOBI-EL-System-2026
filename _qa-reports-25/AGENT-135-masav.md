# AGENT-135 — Masav (מס"ב) Bank File Audit

**Date:** 2026-04-29 | **Auditor:** Agent 135 | **Scope:** Masav file generation, validation, integrity
**Verdict:** AMBER — primary exporter is solid and tested (40/40 green) but **two parallel implementations diverge on record width**, the UI page is a fallback-only shell, and the format does not match the Bank of Israel published spec on record length.

---

## 1. Files in scope

| Path | Role | LOC |
|---|---|---|
| `onyx-procurement/src/bank-files/masav-exporter.js` | Standalone Masav encoder/decoder + PDF | 824 |
| `onyx-procurement/src/payments/payment-run.js` (lines 248–355) | Engine-embedded Masav builder | 1120 |
| `onyx-procurement/test/payroll/masav-exporter.test.js` | Unit suite, 40 tests, 8 suites | ~410 |
| `test/payroll/masav-exporter.test.js` | Mirror copy at repo root | ~410 |
| `erp-app/src/pages/finance/masav-management.tsx` | UI page (RTL Hebrew) | 80+ |
| `_qa-reports/AG-X50-masav-exporter.md` | Original delivery report | 286 |
| `_qa-reports/AG-X49-payment-run.md` | Payment-run engine report | — |

`grep masav` hits 82 files across `_merge-incoming/`, `supabase/migrations/`, AI-Task-Manager docs, locales, and three import mirrors — but only the two `.js` modules above contain real generation logic.

## 2. Format spec implemented

### Exporter (`masav-exporter.js`) — 120-byte records
| Field | Header (T1) | Detail (T2) | Trailer (T9) |
|---|---|---|---|
| Type code | 1 byte `'1'` | 1 byte `'2'` | 1 byte `'9'` |
| Sender bank | 3 | — | 3 (repeat) |
| Sender branch | 3 | — | — |
| Sender account | 5 | — | — |
| Sender ID (ח.פ) | 9 | — | — |
| Batch serial | 6 | in-batch seq 4 | 6 |
| Creation date YYMMDD | 6 | — | 6 |
| Value date YYMMDD | 6 | — | — |
| Type code 01/02 | 2 | — | — |
| Purpose text | 30 | — | — |
| Recipient bank | — | 3 | — |
| Recipient branch | — | 3 | — |
| Recipient account | — | 13 | — |
| Amount aggurot | — | 11 | total 13 |
| Recipient name | — | 20 | — |
| Recipient ID | — | 9 | — |
| Reference | — | 10 | — |
| TX/reason code | — | 6 | — |
| Detail count | — | — | 6 |
| Control hash | — | — | 16 |
| Used | 71 | 80 | 51 |
| Filler to 120 | 49 | 40 | 69 |

Widths verified mathematically (see hash-check below). Layout is internally consistent; numeric fields right-justified zero-pad, alpha left-justified space-pad, padded on overflow with `RangeError`, every emitted record is 120 chars exact (runtime assert at `exportFile()` line 511).

### payment-run.js — 128-byte records (DIVERGES)
The same module declares "128-byte fixed-width" records, uses Type **`5`** for detail (vs `2`), and totally different field offsets (e.g. amount = 12 chars at pos 63-74, count at trailer pos 2-9 = 8 chars). See `payment-run.js:251-355`. **The two implementations cannot interop.**

The Bank of Israel / Masav published interface specifies **128-byte** records with detail type `'5'` (matching `payment-run.js`). The standalone `masav-exporter.js` 120-byte / type `'2'` shape is a custom design — accurate test coverage but **not bank-accepted as written**.

## 3. Header / Footer correctness

- Header overflow guard at line 257-259: throws `header overflow` if used > 120 (currently 71, safe).
- Trailer carries control hash (16 digits) plus repeat sender bank, serial, date — meets self-checksum semantics.
- Detail in-batch serial (`idx + 1` at 4 digits) caps at 9999, but `MAX_DETAIL_LINES = 999999` (line 96) is inconsistent — a 6-digit cap is enforced by trailer "Total detail count" but the in-detail serial field overflows past 9999.

## 4. Account / ID / IBAN validation

| Check | Where | Result |
|---|---|---|
| Bank code in seed list | `isValidBankCode()` line 164 | 17 codes, accepts 2- or 3-digit form |
| Israeli ID (ת"ז) Luhn | `isValidIsraeliId()` line 175 | Standard Luhn-9 — confirmed correct against fixtures |
| Account regex `^[0-9]{1,13}$` | `validateBatch` line 449 | Length only; no bank-specific account checksum |
| Branch regex `^[0-9]{1,3}$` | line 446 | OK for IL — branches are always 3 digits or fewer |
| Amount > 0 and ≤ 99,999,999.99 NIS | line 452-457 | Matches 11-digit aggurot field |
| Duplicate reference detection | line 464-470 | Per-batch Set check |

Cross-reference vs `_qa-reports/AG-92-iban-validator.md`: IBAN validator covers 23 IL banks; **Masav exporter only covers 17**. Banks present in IBAN map but **missing from Masav** seed: 59 (SBI), 65 (FIB), 71 (HSBC), 82 (Citibank), 90/99 (Postal), Bank of Israel (09 vs 9). Bank 13 (Igud) marked `active:false` in Masav (correctly — merged with Mizrahi 2020) but still in IBAN active list. **No IBAN→Masav bridge function exists.** A user with a valid IBAN at SBI, HSBC, or FIB cannot be paid via this exporter.

## 5. Payment grouping

`createBatch()` produces a new `batchId`, lines accumulate via `addPayment()`, no automatic grouping by recipient bank/branch. `payment-run.js:686-703` groups by *payment method* (MASAV vs WIRE vs CHECK) but does not split a Masav file by destination bank. This matches Masav spec — one batch per sender per execution date, all recipients in one file.

`MAX_DETAIL_LINES = 999999` (matches 6-digit count field). State machine: `DRAFT → VALIDATED → EXPORTED` (immutable after export). `addPayment()` blocked post-export (line 384-388) — cannot mutate sealed batches.

## 6. Hash / control hash check

```
sum(BigInt(bank3) + BigInt(branch3) + BigInt(account13) + BigInt(aggurot))
  for every detail line, taken mod 10^16, emitted as decimal string
```
Implemented at lines 307-318 using `BigInt` (necessary — 16-digit overflow Number). Stored back on batch as `controlHash`, written to trailer position 35-51. Determinism test (suite 5/exportFile #4) confirms two independently built batches with identical detail rows produce **byte-identical** detail+trailer regions. SHA-256 of the full file content stored separately as `batch.exportHash` (line 523) — **non-repudiation hash**, distinct from the on-file Masav control hash.

The control-hash algorithm is a reasonable design but NOT the Bank of Israel spec, which uses a "double-row checksum" (sum of even minus odd field sums, custom modulus). The implemented hash will not match what a real Masav bank ingestion validates.

## 7. Test coverage

`node --test test/payroll/masav-exporter.test.js` — **40 tests, 8 suites, all green** (verified live, duration ~6s):

```
createBatch         5/5    addPayment          4/4
validateBatch       7/7    exportFile          8/8
parseReturnFile     4/4    buildSummary        2/2
helpers             7/7    never-delete        3/3
```

Excellent path coverage on happy/sad/edge inside the chosen format. **Zero tests** target the parallel 128-byte builder in `payment-run.js`. The mirror copy under `test/payroll/` is exercised; the same file under `onyx-procurement/test/payroll/` is the same content (duplicate maintenance hazard).

## 8. UI integration (`erp-app/.../masav-management.tsx`)

Page renders four hard-coded `FALLBACK_*` arrays as defaults (lines 19-36). API endpoints `/api/finance/masav/batches`, `/failed-debits`, `/mandates` are queried via `useQuery` but **the route handlers do not exist** — `grep` of `api-server/src` found zero matches for those paths. The UI silently falls back to demo data on 404.

No "Generate file" button visible in first 80 lines; needs deeper UI audit, but the page is currently a viewer-only shell with no path from `createBatch → exportFile → download`.

## 9. Findings (severity ordered)

| # | Severity | Finding |
|---|---|---|
| 1 | **HIGH** | Two parallel Masav implementations: 120-byte/type-`2` (`masav-exporter.js`) vs 128-byte/type-`5` (`payment-run.js:248-355`). Files written by one cannot be read by the other; a bank can only accept one. |
| 2 | **HIGH** | 120-byte record length and detail type `'2'` do not match the Bank of Israel published spec (128 / `'5'`). Custom format will be rejected at bank ingestion. |
| 3 | **HIGH** | Control hash algorithm (sum of bank+branch+account+aggurot, mod 10^16) is a custom design — not the BoI specified field-position checksum. |
| 4 | **MEDIUM** | Six IL bank codes from IBAN validator (SBI 59, FIB 65, HSBC 71, Citibank 82, Postal 90/99) are absent from `ISRAELI_BANKS` map. No bridge to IBAN validator. |
| 5 | **MEDIUM** | UI page `masav-management.tsx` calls `/api/finance/masav/*` endpoints that don't exist server-side; falls back to hard-coded demo arrays. |
| 6 | **MEDIUM** | In-batch detail serial 4 digits (cap 9999) but `MAX_DETAIL_LINES = 999999` and trailer count = 6 digits — inconsistent caps. |
| 7 | **LOW** | Hebrew transliteration map (lines 136-141) drops gimel/dalet vowel distinctions; legal "name match" rejection (reason 010) likely on >5% of payments. |
| 8 | **LOW** | Duplicate test file: `test/payroll/masav-exporter.test.js` and `onyx-procurement/test/payroll/masav-exporter.test.js` are byte-identical maintenance hazards. |
| 9 | **LOW** | `parseReturnFile()` short-line padding (line 557) is forgiving but does not warn — a corrupted return file will silently misclassify positions. |

## 10. Recommendations

1. Pick one implementation. Promote `masav-exporter.js` API surface, delete the duplicate builder in `payment-run.js`, have `payment-run.exportMasav()` delegate to it.
2. Re-implement to actual Bank of Israel spec (128-byte, type `5`, real control-row algorithm). Source: BoI "מפרט קלט מס"ב" (Masav Input Spec) — unavailable in repo.
3. Add a `bankCodeToMasav(ibanBankCode)` bridge so IBAN-validated accounts can be paid; or inline the IBAN validator's 23-bank list into `ISRAELI_BANKS`.
4. Stand up `/api/finance/masav/{batches,failed-debits,mandates}` route handlers in `api-server/src/routes/`, add a "Generate file" action wiring `createBatch → exportFile`.
5. Tighten `MAX_DETAIL_LINES` to 9999 to match the in-detail serial field, or widen the serial field to 6.
6. Add integration tests for the 128-byte path in `payment-run.js` until it is removed.

---
**Tests run live:** PASS 40/40 on `node --test test/payroll/masav-exporter.test.js`.
**Exporter logic quality:** GOOD — clean, zero-deps, immutable post-export, well-validated.
**Spec conformance:** POOR — non-standard format that will not interop with real Israeli banks.
