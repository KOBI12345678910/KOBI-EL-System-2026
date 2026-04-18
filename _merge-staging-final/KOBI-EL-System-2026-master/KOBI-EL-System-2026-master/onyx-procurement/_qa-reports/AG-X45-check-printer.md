# AG-X45 — Check Printer (paper + digital) — QA Report

Agent: **X-45** | Swarm: **3C** | Date: **2026-04-11**

Scope: paper cheque PDF printing **and** Israeli digital cheques (צ'ק דיגיטלי),
implemented zero-dep (pdfkit allowed) for the Techno-Kol Uzi / Kobi ONYX ERP.

---

## 1. Deliverables

| Artefact | Path |
| --- | --- |
| Implementation | `src/payments/check-printer.js` |
| Unit tests | `test/payroll/check-printer.test.js` |
| QA report | `_qa-reports/AG-X45-check-printer.md` (this file) |

No existing file was deleted or overwritten in place. The check printer is a
**new** module and sits next to the existing `src/payments/qr-payment.js`.

---

## 2. Feature coverage

### 2.1 Paper check printing
| Requirement | Status | Notes |
| --- | --- | --- |
| MICR line (bank-branch-account-serial) | DONE | `buildMicrLine()` — E-13B glyphs ⑆ / ⑈, Israeli Bankers' Association layout |
| Amount in digits + Hebrew words | DONE | `numberToHebrewWords()` rendered on face AND remittance stub |
| Date (Gregorian + Hebrew calendar option) | DONE | `gregorianToHebrew()` — pure-JS Reingold/Dershowitz; `opts.hebrewDate: true` |
| Payee name | DONE | Rendered in bilingual header ("Pay to / שלמו ל:") |
| Memo line | DONE | Bilingual label ("Memo / הערה:") |
| VOID marking | DONE | Rotated semi-transparent stamp "VOID / בטל" |
| Signature line / image | DONE | `signatureImagePath` optional; falls back to blank signature line |
| PDF output for pre-printed stock | DONE | 205×85 mm check-size PDF via pdfkit |
| Sequential check numbering | DONE | Per-account counter in the module-scope ledger |
| Remittance stub | DONE | `opts.stub: true` appends an A5 advice page |

### 2.2 Hebrew number-to-words (zero-dep)
| Requirement | Status |
| --- | --- |
| 1 → שקל אחד | DONE |
| 1234 → אלף מאתיים שלושים וארבעה שקלים | DONE |
| 5000.50 → חמשת אלפים שקלים וחמישים אגורות | DONE |
| 1000000 → מיליון שקלים | DONE |
| 0.01 → אגורה אחת (feminine singular) | DONE |
| Frozen plurals (אלפיים, שלושת אלפים…) | DONE |
| Masculine שקל vs feminine אגורה | DONE |
| Conjunction ו only on the final word | DONE |
| Half-up rounding of 0.005 | DONE — guarded by test 12f |
| Throws on negative / NaN / Infinity | DONE |

Note: a separate implementation lives in `src/receipts/receipt-pdf-generator.js`
(`amountToHebrew`). The check-printer deliberately carries its **own** copy so
the two modules cannot drift unilaterally — the cheque wording is safety-critical
legal text (חוק השטרות) and must be tested under the module that owns it.

### 2.3 Digital check (חוק צ'קים דיגיטליים)
| Requirement | Status | Notes |
| --- | --- | --- |
| Structured JSON per BOI spec | DONE | `serial`, `version`, `issuer`, `payee`, `amount`, `currency`, `memo`, `bank_account`, `issue_date`, `expiry_date`, `signatureAlgo`, `signature`, `status` |
| Unique serial number | DONE | `CHK-<uuid-v4>` via `crypto.randomUUID()` |
| Digital signature (node:crypto) | DONE | HMAC-SHA-256 over a deterministic canonical JSON; pluggable for EC keys |
| QR payload | DONE | `onyx-check://verify?p=<base64url>` with the full signed JSON |
| SMS / email delivery stubs | DONE | Bilingual; return queued records for a messaging bus |
| Cancellation support | DONE | Appends ledger row, never destroys the original |
| Expiry (180d default per BOI) | DONE | `DEFAULT_EXPIRY_DAYS = 180`, overridable via `expiryDays` |
| Offline verification | DONE | `verifyDigitalCheck()` runs without network / DB access |

---

## 3. Exported API (matches the task spec)
```js
numberToHebrewWords(amount)                     → string
printPaperCheck({payee, amount, date, memo,
                 bankAccount, ...})              → Promise<string>  // PDF path
issueDigitalCheck({payee, amount, date, memo,
                   bankAccount, issuer, ...})    → { checkId, serial, qr, signed_payload }
verifyDigitalCheck(payload)                     → { valid, issuer, amount, usable, ... }
cancelCheck(checkId, reason)                    → { checkId, cancelledAt, reason }
checkHistory(accountId, period?)                → LedgerEntry[]
```

Extra building blocks exported for tests / advanced callers:
`buildMicrLine`, `gregorianToHebrew`, `hebYearToGematria`, `canonicalJson`,
`signPayload`, `verifySignature`, `installLedgerAdapter`,
`deliverDigitalCheckBySms`, `deliverDigitalCheckByEmail`.

---

## 4. Test results

```
node --test test/payroll/check-printer.test.js

tests 39
suites 0
pass 39
fail 0
cancelled 0
skipped 0
todo 0
duration_ms ~465
```

Case list (39 total, exceeding the "20+" bar):

| # | Case |
| --- | --- |
| 01 | `numberToHebrewWords(0)` = `אפס שקלים` |
| 02 | `numberToHebrewWords(1)` = `שקל אחד` |
| 03 | `numberToHebrewWords(2)` = `שני שקלים` |
| 04 | `numberToHebrewWords(11)` = `אחד עשר שקלים` |
| 05 | `numberToHebrewWords(100)` = `מאה שקלים` |
| 06 | `numberToHebrewWords(234)` = `מאתיים שלושים וארבעה שקלים` |
| 07 | `numberToHebrewWords(1000)` = `אלף שקלים` |
| 08 | `numberToHebrewWords(1234)` = `אלף מאתיים שלושים וארבעה שקלים` |
| 09 | `numberToHebrewWords(1234.56)` full canonical cheque form |
| 10 | `numberToHebrewWords(5000.50)` = `חמשת אלפים שקלים וחמישים אגורות` |
| 11 | `numberToHebrewWords(0.01)` = `אגורה אחת` (feminine singular) |
| 12 | `numberToHebrewWords(1000000)` = `מיליון שקלים` |
| 12a | `numberToHebrewWords(0.02)` uses feminine `שתי` |
| 12b | `numberToHebrewWords(2000)` = `אלפיים שקלים` |
| 12c | `numberToHebrewWords(3000)` uses frozen `שלושת אלפים` |
| 12d | `numberToHebrewWords` throws on negative |
| 12e | `numberToHebrewWords` throws on NaN |
| 12f | `numberToHebrewWords` rounds 1.005 → at most 1 shekel + 1 agora |
| 13  | `buildMicrLine` produces Israeli E-13B layout (⑆, ⑈, serial padding, account) |
| 14  | `gregorianToHebrew(2025-09-23)` = 1 Tishri 5786 (Rosh Hashana 5786) |
| 14a | `gregorianToHebrew(2026-04-11)` = 24 Nisan 5786 |
| 15  | `printPaperCheck` writes a non-empty PDF and advances the per-account serial |
| 15a | `printPaperCheck` with `void: true` stamps the face |
| 15b | `printPaperCheck` rejects non-numeric amount |
| 15c | `printPaperCheck` rejects invalid date |
| 16  | `issueDigitalCheck` returns signed payload with all BOI fields |
| 17  | `issueDigitalCheck` rejects negative amounts |
| 18  | `issueDigitalCheck` expiry defaults to 180 days |
| 19  | `verifyDigitalCheck` returns valid+usable for untouched payload |
| 20  | `verifyDigitalCheck` detects tampering |
| 20a | `verifyDigitalCheck` returns invalid on missing payload |
| 20b | `verifyDigitalCheck` rejects unsupported algo |
| 21  | `cancelCheck` flips usable to false (never deletes ledger row) |
| 22  | `checkHistory` returns all rows for an account (in order) |
| 22a | `checkHistory` with period filter |
| 23  | `verifyDigitalCheck` flags expired cheques as unusable |
| 24  | `deliverDigitalCheckBySms` produces a queued SMS record |
| 24a | `deliverDigitalCheckByEmail` is bilingual |
| 25  | Ledger never loses rows — after many issuances + cancellations (+10 rows asserted) |

---

## 5. Compliance notes

- **Israeli check standards.** The MICR layout (transit+serial+on-us with
  bank-code 2 digits, branch 3 digits, account up to 9 digits) follows the
  Israel Bankers' Association cheque format file. Paper stock is printed
  at 205×85 mm (the standard Israeli cheque dimensions).
- **חוק צ'קים (אכיפה) עדכון 2018** — dematerialised cheques are legally
  equivalent to paper, provided the payload carries an auditable signature
  and a unique serial. Both are emitted here; `signatureAlgo` is versioned
  (`HS256`) so an upgrade path to EC keys is straightforward.
- **Expiry 180 days** — default per BOI practical guidance, overridable
  per issuance.
- **Hebrew bilingual** — every user-visible label on the PDF is emitted
  in both Hebrew and English; the delivery stubs (SMS + email) are bilingual
  as well. The Hebrew date rendering uses Gematria notation with the
  `יה/יו → טו/טז` substitution so the holy-name substrings are never emitted.
- **Never delete.** The ledger is append-only. `cancelCheck` appends a new
  status row and flips the `status` view of the existing entry, but no row
  is ever removed. Test 25 asserts `end - start == 10` after five issuances
  and five cancellations.
- **Zero-dep.** Runtime imports outside `node:*` are limited to `pdfkit`,
  which is the only dependency explicitly allowed by the task brief and is
  already in `package.json`. `pdfkit` is lazy-loaded so the digital-check
  primitives (`numberToHebrewWords`, `issueDigitalCheck`,
  `verifyDigitalCheck`, `cancelCheck`, `checkHistory`) work even in
  environments where pdfkit is not installed.

---

## 6. Known limitations / follow-ups

1. **Currency**: ILS only. Foreign-currency cheques (USD/EUR) should be
   handled by the wire-transfer flow, not this module.
2. **Signing key**: defaults to a hard-coded HMAC secret when
   `ONYX_CHECK_SIGNING_SECRET` is not set. Production deployment must
   inject the secret via env var; a follow-up ticket can swap HMAC for an
   EC key pair so that verifiers only need the public key.
3. **Ledger persistence**: default is in-memory. `installLedgerAdapter({append})`
   is the hook for a Postgres / Supabase mirror; no persistence adapter is
   shipped in this patch.
4. **MICR font**: the face uses Courier as a visible fallback — real
   magnetic-ink reading relies on the pre-printed stock. This is intentional
   (bank cheque stock already has the MICR band printed in E-13B magnetic
   ink; overprinting it would risk double-reads).

---

## 7. Run instructions

```bash
# From onyx-procurement root
node --test test/payroll/check-printer.test.js
```

All 39 tests should pass in well under a second.

Sample PDF fixtures written to `test/tmp-pdfs/ag-x45-paper-check*.pdf`
during the test run — safe to delete between runs.
