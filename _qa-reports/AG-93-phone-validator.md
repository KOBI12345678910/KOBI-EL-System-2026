# AG-93 — Israeli Phone Validator & Carrier Detector

**Agent:** 93
**Date:** 2026-04-11
**Scope:** `onyx-procurement/src/validators/phone.js` + unit tests
**Rule of engagement:** additive only, nothing deleted, zero runtime deps.
**Language:** bilingual (EN/HE labels on every carrier, region, special code).

---

## 0. Executive summary

| Metric                    | Value                                                |
|---------------------------|------------------------------------------------------|
| New files                 | 2 (module + tests)                                   |
| Lines of code (module)    | ~470                                                 |
| Lines of test             | ~350                                                 |
| Test count                | **72 tests, 12 suites**                              |
| Pass rate                 | **72 / 72 (100%)**                                   |
| Runtime deps              | **0** (uses built-in `node:test`)                    |
| Node min version          | 18 (for `node:test`); module itself runs on 14+      |
| Deletions                 | none                                                 |

All 72 tests green on first clean run after fixing the emergency-code edge
case (see §5). No regressions to existing payroll / procurement suites because
this is a new validator under a fresh folder.

---

## 1. Deliverables

### 1.1 Module

**Path:** `onyx-procurement/src/validators/phone.js`

Public API:

```js
const {
  validateIsraeliPhone,  // main entry → { valid, type, carrier?, e164, … }
  parseIsraeliPhone,     // structured breakdown for UI previews
  formatForDisplay,      // "050-123-4567" | "+972 50 123 4567" | "+972501234567"
  normalizeToNational,
  classify,
  TYPES,
  MOBILE_PREFIXES,
  LANDLINE_AREA_CODES,
  SERVICE_PREFIXES,
  SPECIAL_CODES,
  VOIP_PREFIXES,
} = require('./src/validators/phone');
```

`validateIsraeliPhone(input)` returns:

```js
{
  valid: boolean,
  type: 'mobile' | 'landline' | 'toll_free' | 'premium' | 'special' | 'voip' | 'unknown',
  carrier?: string,             // primary carrier (historical prefix owner)
  carriers?: string[],          // all possible carriers for the prefix
  carrier_he?: string,          // Hebrew label
  region?: string,              // landline region (EN)
  region_he?: string,           // landline region (HE)
  portable?: boolean,           // true for mobile (Israeli number portability)
  e164: string,                 // "+972501234567"
  national: string,             // "0501234567"
  display_local: string,        // "050-123-4567"
  display_international: string, // "+972 50 123 4567"
  input: string,                // echo
  reason?: string,              // when invalid
}
```

### 1.2 Tests

**Path:** `onyx-procurement/test/payroll/phone.test.js`

Run with:

```bash
node --test test/payroll/phone.test.js
```

---

## 2. Numbering-plan coverage

### 2.1 Mobile (type `mobile`)

| Prefix | Carrier(s) (historical)          | Hebrew                       |
|--------|----------------------------------|------------------------------|
| 050    | Pelephone                        | פלאפון                       |
| 051    | Home Cellular                    | הום סלולר                    |
| 052    | Cellcom, Pelephone               | סלקום / פלאפון               |
| 053    | Hot Mobile, Partner              | הוט מובייל / פרטנר           |
| 054    | Partner, Cellcom                 | פרטנר / סלקום                |
| 055    | Hot Mobile                       | הוט מובייל                   |
| 056    | Palestinian Operator             | מפעיל פלסטיני                |
| 057    | MVNO                             | מפעיל וירטואלי               |
| 058    | Golan Telecom, Rami Levy         | גולן טלקום / רמי לוי         |
| 059    | Jawwal                           | ג׳ואל                        |

All mobile numbers carry `portable: true` because Israeli number portability
(נייד נייד) means the historical prefix owner is not guaranteed to be the
current carrier. Callers should treat `carrier` as historical-only and use
`carriers[]` for the full candidate set.

Length rule: **exactly 10 digits** in national form (`05X-XXX-XXXX`).

### 2.2 Landline (type `landline`)

| Code | Region                      | Hebrew                         |
|------|------------------------------|--------------------------------|
| 02   | Jerusalem                   | ירושלים                         |
| 03   | Tel Aviv / Gush Dan         | תל אביב / גוש דן                |
| 04   | Haifa / North               | חיפה / הצפון                    |
| 07   | Beer Sheva (historical)     | באר שבע (היסטורי)               |
| 08   | Central South / Ashdod      | מרכז דרום / אשדוד / אשקלון     |
| 09   | Sharon                      | השרון                          |

Length rule: **exactly 9 digits** in national form (`0X-XXX-XXXX`). Beer Sheva
today uses 08; 07 is retained only for historical import records.

### 2.3 VOIP (type `voip`)

077, 072, 073, 074, 076, 078 — non-geographic. 10 digits.

### 2.4 Service numbers

| Prefix | Type       | Label          | Hebrew                     |
|--------|------------|----------------|----------------------------|
| 1-800  | toll_free  | Toll-Free      | חיוג חינם                  |
| 1-700  | toll_free  | Shared-Cost    | מספר ארצי                  |
| 1-599  | toll_free  | Shared-Cost    | מספר ארצי                  |
| 1-900  | premium    | Premium Rate   | שירות מיוחד בתשלום         |
| 1-919  | premium    | Premium Rate   | שירות מיוחד בתשלום         |

### 2.5 Special / emergency (type `special`)

| Code | Service              | Hebrew                    |
|------|----------------------|---------------------------|
| 100  | Police               | משטרה                     |
| 101  | Magen David Adom     | מגן דוד אדום              |
| 102  | Fire & Rescue        | כבאות והצלה               |
| 103  | Electric Company     | חברת חשמל                 |
| 104  | Home Front Command   | פיקוד העורף               |
| 105  | Child Online Safety  | הגנה מקוונת לילדים        |
| 106  | Municipality         | עירייה                    |
| 107  | Consumer Protection  | הגנת הצרכן                |
| 110  | Bezeq Info           | בזק מידע                  |
| 118  | Social Services      | רווחה                     |
| 144  | Directory Assistance | מודיעין 144               |

---

## 3. Accepted input formats

All of the following parse to the same canonical national form
`0501234567` and E.164 `+972501234567`:

- `050-1234567`
- `0501234567`
- `050 123 4567`
- `(050) 123-4567`
- `972-50-1234567`
- `+972501234567`
- `00972501234567`
- `+972 50 123 4567`

Normalisation pipeline:

1. Strip all non-digit characters (keep optional leading `+` flag).
2. Strip international access prefixes: `00972`, `011972`, plain `972`
   when a `+` was present or when length implies country-code form.
3. Re-prepend the national trunk `0` if it was eaten.
4. Classify by prefix match.
5. Length-check per classified type.

---

## 4. Test matrix

**File:** `onyx-procurement/test/payroll/phone.test.js`

| Suite | # | Covers                                               |
|-------|---|------------------------------------------------------|
| 1  | 8  | Accepted input formats (same number, 8 wire forms)   |
| 2  | 12 | Mobile carrier detection for every 050-059 prefix + dual-carrier 052/058 |
| 3  | 7  | Every landline area code + international form       |
| 4  | 4  | 1-800 / 1-700 / 1-900 / 1-599 service numbers        |
| 5  | 6  | Emergency codes 100-106                              |
| 6  | 11 | Negative cases (empty, null, bad length, non-IL, letters, …) |
| 7  | 3  | `parseIsraeliPhone()` structured output              |
| 8  | 7  | `formatForDisplay()` including round-trip           |
| 9  | 6  | `normalizeToNational()` edge cases                   |
| 10 | 3  | Hebrew bilingual labels on mobile / landline / emergency |
| 11 | 3  | Exported constants integrity                         |
| 12 | 2  | VOIP (077, 072)                                      |
| **Total** | **72** | |

### 4.1 Final test output

```
ℹ tests 72
ℹ suites 12
ℹ pass  72
ℹ fail  0
ℹ cancelled 0
ℹ skipped 0
ℹ duration_ms ~204
```

---

## 5. Bugs found during dev and fixed in this PR

### 5.1 Emergency code false-negative

**Symptom:** `validateIsraeliPhone("101")` returned `{ valid: false, reason: "unrecognised prefix / area code" }`.

**Root cause:** `normalizeToNational` prepends `0` to any digit string that
does not already start with `0` (so that `+972501234567` becomes
`0501234567`). For a raw 3-digit emergency code `101`, the normaliser
produced `0101`, which then tripped the `startsWith('01')` branch that
hunts for service-number prefixes — and `0101` is not a service number.

**Fix:** added a fast path at the top of both `validateIsraeliPhone` and
`parseIsraeliPhone` that matches 3-digit special codes before touching
the normaliser. See `phone.js` line range around the top of
`validateIsraeliPhone`. No test or public contract changed.

### 5.2 No other bugs found.

---

## 6. Risk notes for downstream consumers

1. **Number portability.** The `carrier` field is *historical*, derived
   from the Ministry of Communications prefix allocation table. Do NOT
   use it for carrier-specific routing (SMS gateway selection, toll
   calculation) without calling the live MNP lookup service first.
   The `portable: true` flag signals this explicitly.

2. **052 / 054 dual listing.** Both prefixes were split-allocated and
   therefore return 2-element `carriers[]`. UI code should render the
   first entry as primary and surface the rest as "possible carrier".

3. **Emergency codes are not internationally dialable.** The function
   still returns them unchanged in `display_international` for DB
   consistency — do NOT build `tel:` links from that value for 3-digit
   codes.

4. **Toll-free numbers returned e164 is synthetic.** 1-800 numbers are
   not part of the E.164 international-dialing space. The value
   `+97218001234` is returned purely for uniform storage; it is not a
   dialable number from outside Israel.

5. **07 historical area code.** Present for import compatibility only.
   New records should use 08 for Beer Sheva.

---

## 7. Compliance & Kobi's rules

| Rule                        | Status                                 |
|-----------------------------|----------------------------------------|
| Never delete                | ✓ additive only                        |
| Hebrew bilingual            | ✓ `_he` field on every carrier / region / label |
| Israeli compliance          | ✓ Ministry of Communications numbering plan |
| Zero deps                   | ✓ pure CommonJS, `node:test` only      |
| Real code (no TODOs)        | ✓ complete implementation              |
| Tests ≥ 30                  | ✓ 72 tests delivered                   |

---

## 8. Files touched

| Path                                                     | Action  | LOC  |
|----------------------------------------------------------|---------|------|
| `onyx-procurement/src/validators/phone.js`               | create  | ~470 |
| `onyx-procurement/test/payroll/phone.test.js`            | create  | ~350 |
| `_qa-reports/AG-93-phone-validator.md`                   | create  | this |

No other file was touched. No dependency added to `package.json`.

---

## 9. Next steps (not in scope of AG-93)

- Wire the validator into the supplier-onboarding form and the payroll
  employee CRUD so that every stored phone gets normalised to E.164.
- Add a migration that backfills `contact_phone_e164` columns by piping
  existing rows through `validateIsraeliPhone` — report rejects as
  data-quality issues rather than hard-failing.
- If live MNP carrier lookup becomes available, extend the module with
  an async `resolveCurrentCarrier(e164)` that preserves the sync API as
  fallback.

— End of AG-93.
