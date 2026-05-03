# AGENT-146 — Israeli ID Validators Audit

**Agent:** 146
**Date:** 2026-04-29
**Scope:** Verify implementations of IL ID validators referenced in
prior QA reports (AG-92 IBAN, AG-93 phone, AG-94 company-id, AG-95
tax-file). Also covers the bonus 5th validator `teudat-zehut` (ת.ז.).
**Status:** GREEN — 265/265 tests passing across 5 validator suites.

---

## 1. Executive summary

| Validator                     | Module                                          | Tests file                                       | Tests | Status |
|-------------------------------|-------------------------------------------------|--------------------------------------------------|-------|--------|
| ת.ז (Teudat Zehut, 9-digit)   | `onyx-procurement/src/validators/teudat-zehut.js` | `test/payroll/teudat-zehut.test.js`            | 64    | PASS   |
| ח.פ / ע.מ (Company ID)        | `onyx-procurement/src/validators/company-id.js` | `test/payroll/company-id.test.js`              | 35    | PASS   |
| Tax file (תיק ניכויים/מע"מ)   | `onyx-procurement/src/validators/tax-file.js`   | `test/payroll/tax-file.test.js`                | 47    | PASS   |
| IBAN (ISO 13616, IL-aware)    | `onyx-procurement/src/validators/iban.js`       | `test/payroll/iban.test.js`                    | 47    | PASS   |
| Phone IL (mobile/landline)    | `onyx-procurement/src/validators/phone.js`      | `test/payroll/phone.test.js`                   | 72    | PASS   |
| **Total**                     |                                                 |                                                  | **265** | **PASS 265/0** |

```
$ node --test test/payroll/{iban,phone,company-id,tax-file,teudat-zehut}.test.js
ℹ tests 265   ℹ suites 27   ℹ pass 265   ℹ fail 0   ℹ duration_ms ~17224
```

All four reference QA reports (AG-92 / AG-93 / AG-94 / AG-95) accurately
describe what is implemented on disk. Test counts match: AG-92 claimed 47,
AG-93 claimed 72, AG-94 claimed 35, AG-95 claimed 47 — all verified.
LOC totals: iban=373, phone=659, company-id=360, tax-file=505 (1,897 total).

---

## 2. Per-validator findings

### 2.1 ת.ז (Israeli National ID, 9-digit Luhn variant)

**File:** `onyx-procurement/src/validators/teudat-zehut.js` (342 lines)

- Algorithm verified at L189-202 (`computeChecksum`): alternating
  weights 1,2,1,2,1,2,1,2,1; product>9 collapsed by `-9`; sum%10===0.
- 8-digit legacy IDs are zero-padded to 9 (L173).
- Hard-reserved bands rejected: `000000000`, `999999999`, `000000001..017`
  (L61-75). Canonical fixture `000000018` IS accepted (L48-50, verified).
- Bilingual reasons present on every failure path (HE + EN concatenated
  with `/`). Verified against `123456789` → `ספרת ביקורת שגויה / invalid check digit`.
- Test fixtures `000000018`, `123456782` validate; `123456789` rejected.

### 2.2 ח.פ / ע.מ (Company ID — AG-94)

**File:** `onyx-procurement/src/validators/company-id.js` (360 lines)

- Same Luhn-style checksum (L132-143, weights 1,2,1,2,...,1).
- Prefix taxonomy verified in `classifyByPrefix` (L150-166):
  - `50`→government, `51`→llc, `52`→public, `54`→foreign,
  - `57`→public_benefit (חל"צ), `58`→non_profit (עמותה),
  - `59`→cooperative (אגודה שיתופית), other `5x`→private,
  - leading 1-4/6-9 → `individual_dealer` (= ע.מ / ת.ז).
- `KNOWN_GOVERNMENT_IDS` whitelist frozen at L87-96 (8 placeholder
  entries — flagged in AG-94 §6.1 as needing real values; that
  follow-up remains open).
- Spot-checked: `510000003`→llc/valid, `580000008`→non_profit/valid,
  `590000006`→cooperative/valid, `510000004`→`BAD_CHECKSUM`,
  `500100003`→`bypassed:true`, `300000007`→individual_dealer/valid,
  same with `allowIndividualDealer:false` → invalid (`NOT_COMPANY`).
- `getRegistrarUrl` returns the correct registry per type (L310-337):
  Hachvarot / Amutot / Shitufiot / misim.gov.il.
- **AG-94 follow-up §7 still open**: `src/imports/legacy-migration.js`
  L773-779 still has its own inline validator — not yet migrated to
  use this canonical module.

### 2.3 Tax file — תיק ניכויים / מע"מ / מס הכנסה / ע.מ (AG-95)

**File:** `onyx-procurement/src/validators/tax-file.js` (505 lines)

- Same Israeli-Luhn check at L183-193 (`luhnIsraeliCheck`).
- 4 typed shortcuts: `validateWithholdingFile`, `validateVatFile`,
  `validateIncomeTaxFile`, `validateOsekMorsheFile` (L327-345).
- 8 reason codes including `RESERVED_PREFIX` declared but unused
  (AG-95 §3.2 — reserved-prefix list still empty pending publication).
- `crossReference()` ladder verified at L373+ (1.0 / 0.9 / 0.6 / 0.0
  confidence buckets matching AG-95 §4 table).
- `checkActiveStatus()` is an async stub returning `{status:"unknown",
  source:"stub"}` per AG-95 §5 — Shaam integration TODO is genuine.
- Spot-checked: `937123453` valid; `000000000` rejected `all_zeros`.
- **Algorithm caveat preserved from AG-95 §3.4**: VAT and
  osek_morshe currently use the same Luhn variant as withholding,
  not the mod-11 variant `israeliVatNumberValid()` already present
  in `src/scanners/barcode-scanner.js` L241+. If Shaam confirms
  mod-11 is required for VAT files, swap the dispatch — fixtures
  in suites 3.2/3.4 will need recomputation. Not blocking today.

### 2.4 IBAN — ISO 13616 with IL parsing (AG-92)

**File:** `onyx-procurement/src/validators/iban.js` (373 lines)

- ISO 13616 MOD-97 algorithm verified at L171-184 — uses `BigInt`
  (not Number) per AG-92 §5 because rearranged numeric exceeds 2^53.
- Letter-to-digit map at L144-162 (`A=10..Z=35`).
- 23-char IL length enforced via `IBAN_COUNTRY_LENGTHS.IL=23` (L105);
  test fixtures with 22 or 24 chars correctly rejected with
  `bad_length_for_IL:expected_23_got_N`.
- Israeli BBAN split into bank(3)/branch(3)/account(13) at L326-337.
- `israeliBanks` map (L61-85) is `Object.freeze`d and bilingual; 23
  banks present including legacy code 20 (Mizrachi) plus modern 12
  (Mizrahi Tefahot), and legacy 77 plus current 54 (Jerusalem).
- Spot-checked: `IL620108000000099999999` validates with
  `country=IL, bank_code=010, bank_name_en=Leumi`;
  `DE89370400440532013000` validates; bad-checksum IL rejected.
- Reason codes match the AG-92 §3 table including `mod97_error`,
  `unknown_country`, `bad_format`.

### 2.5 Phone IL (AG-93)

**File:** `onyx-procurement/src/validators/phone.js` (659 lines)

- Mobile prefixes 050-059 mapped at L44-55. `052` and `054` are
  dual-listed (Cellcom/Pelephone, Partner/Cellcom respectively) and
  return 2-element `carriers[]`. `portable: true` is always set on
  mobile per Israeli MNP rules (L236).
- Mobile length: exactly 10 digits in national form (L292).
- Landline area codes 02/03/04/07(historical)/08/09 mapped at L58-68.
- Landline length: exactly 9 digits in national form (L298).
- VOIP 077, 072, 073, 074, 076, 078 (L71-78) — 10 digits.
- Service 1800/1700/1599/1900/1919, special 100-107/110/118/144.
- **Emergency-code fast path verified at L442-460** — this is the
  bug fix described in AG-93 §5.1. Without it, the normaliser
  prepends `0` to a 3-digit code making `101 → 0101` which then
  fails the `01XX` service-prefix check.
- Spot-checked: `0501234567`→Pelephone valid, `+972501234567`→same
  E.164, `03-1234567`→Tel Aviv landline valid, `101`→special valid,
  `1-800-123-456`→toll_free valid, `050-123`→invalid (length).
- Multiple input formats accepted: dashes, spaces, parentheses,
  `+972`, `00972`, `972` prefix.

---

## 3. Compliance / cross-cutting checks

| Rule                        | Status | Evidence                                   |
|-----------------------------|--------|--------------------------------------------|
| Zero runtime dependencies   | PASS   | All 5 modules use only built-in Node APIs (no `require()` of npm packages). |
| Hebrew bilingual messages   | PASS   | `reason_he` / `reason_en` (or HE+EN combined string) on every failure path across all 5 validators. |
| Frozen constants ("never delete") | PASS | `Object.freeze()` on `israeliBanks`, `IBAN_COUNTRY_LENGTHS`, `MOBILE_PREFIXES`, `LANDLINE_AREA_CODES`, `SPECIAL_CODES`, `TYPE`, `TYPE_LABELS`, `REASON`, `KNOWN_GOVERNMENT_IDS`, `TAX_FILE_TYPES`, `REASON_CODES`. |
| Never throws on bad input   | PASS   | All entry points return `{valid:false, reason:...}` for null/undefined/object/NaN/garbage. |
| ISO/algorithm correctness   | PASS   | MOD-97 (IBAN), Luhn-variant (ת.ז/ח.פ/tax-file). Spot-checks against canonical fixtures all pass. |
| BigInt for IBAN MOD-97      | PASS   | `iban.js` L179 uses `BigInt(numeric) % 97n`. |

Algorithm consistency: ת.ז, ח.פ, and tax-file all share the same
9-digit Luhn-variant (weights 1,2,1,2,1,2,1,2,1; product>9 → -9;
sum%10===0). Three independent implementations, identical behavior.
This is also the same algorithm as `src/scanners/barcode-scanner.js`
→ `luhnIsraeliIdValid()` (L241+), so the repo has 4 copies. Future
refactor candidate but not a blocker.

---

## 4. Open follow-ups (carried forward)

1. **AG-94 §7** — replace inline `validateIsraeliCompanyId` in
   `src/imports/legacy-migration.js` L773-779 with import from
   `src/validators/company-id.js`. Not done.
2. **AG-95 §8.1** — wire `validateTaxFile()` into the four call sites
   listed (`wage-slip-calculator.js` L362, `quarterly-tax-report.js`
   L1087/1335, `tax/form-builders.js` L46). Currently these read the
   raw column with no validation.
3. **AG-95 §8.4** — verify whether VAT files truly use the Luhn
   variant or the mod-11 variant; both implementations exist in the
   repo (Luhn in tax-file.js, mod-11 in barcode-scanner.js).
4. **AG-94 §6.1** — `KNOWN_GOVERNMENT_IDS` in company-id.js holds
   8 placeholder entries (`500100003` etc.) that should be replaced
   with real historic IDs as data-migration runs surface them.
5. **AG-92 §10** — `test/unit/qa-02-validators.test.js` still ships
   its own reference IBAN implementation; should import from the
   canonical module instead.
6. **AG-95 §5** — `checkActiveStatus()` Shaam integration is a
   genuine stub awaiting gov.il SSO availability.

---

## 5. Verdict

All four reference reports (AG-92, AG-93, AG-94, AG-95) are
ACCURATE. Implementations are present on disk, follow zero-dep
pure-JS rules, are bilingual (HE+EN), pass full self-tests
(265/265), and correctly implement the relevant Israeli compliance
algorithms (MOD-97 with BigInt for IBAN, Luhn-variant for the three
9-digit registry numbers, Ministry of Communications numbering plan
for phone). Plus the 5th validator `teudat-zehut.js` (Agent 91) is
present and matches the same standard.

Wiring of these validators into the rest of the ERP (per the
follow-ups in §4) remains the largest open item — the validators
exist and are correct, but several callers still bypass them.

**Agent 146 — audit complete. GREEN.**
