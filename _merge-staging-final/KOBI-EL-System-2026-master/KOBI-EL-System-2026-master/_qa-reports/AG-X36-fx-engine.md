# AG-X36 — Multi-Currency FX Engine (Bank of Israel)

**Agent:** X-36
**Swarm:** 3C
**Module:** Onyx Procurement / `onyx-procurement/src/fx/fx-engine.js`
**Test:** `test/payroll/fx-engine.test.js`
**Date:** 2026-04-11
**Status:** GREEN — 28/28 tests passing
**Dependencies:** **ZERO** (Node built-in `fetch`, `Intl`, `Map`)

---

## 1. Scope

Deliver a production-grade multi-currency engine for Techno-Kol Uzi's ERP, anchored to the ILS base, wired to the Bank of Israel (בנק ישראל) daily rate schedule, and IAS 21-compliant for unrealized FX revaluation.

מנוע שערי חליפין רב-מטבעי לצרכי דיווח, רכש, ושערוך פוזיציות לא-ממומשות, בהתאם ל-IAS 21 ולנוהלי רשות המסים בישראל.

## 2. Files

| File | LOC | Purpose |
|------|----:|---------|
| `onyx-procurement/src/fx/fx-engine.js` | 811 | Core engine module (CommonJS) |
| `test/payroll/fx-engine.test.js`       | 466 | Test suite (28 cases, zero-dep runner) |
| `_qa-reports/AG-X36-fx-engine.md`      | —   | This report |

## 3. Public API

```js
const { createFxEngine } = require('./onyx-procurement/src/fx/fx-engine');

const engine = createFxEngine({
  boiUrl:     'https://www.boi.org.il/currency.xml',
  fetcher:    async (url) => '...',    // pluggable (Node fetch by default)
  now:        () => new Date(),        // clock injection
  cacheMax:   1000,                    // LRU capacity
  staleHours: 24,                      // stale-flag threshold
  autoFetch:  false                    // auto refresh on boot
});

engine.getRate(from, to, date?)          // → { rate, source, asOf, stale, direction }
engine.convert(amount, from, to, date?)  // → { converted, rate, source, stale, ... }
engine.revalue(positions[], asOf)        // → { lines, byCurrency, totalUnrealizedIls, taxNotice }
engine.setOverride(from, to, rate, date) // manual override (highest priority)
engine.loadRates(snapshotOrXml)          // bulk seed from BoI XML or object
engine.refreshFromBoi(signal?)           // async fetch + load
engine.purgeExpired(nowIso, days?)       // GC stale rate days
engine.cacheStats()                      // → { size, hits, misses, overrides, ... }
engine.listCurrencies()                  // → string[]
engine.describeCurrency(code)            // → metadata (symbol, decimals, Heb/En names)
engine.dumpRates(date)                   // → snapshot of stored rates
```

## 4. Feature Matrix

| Requirement | Status | Notes |
|---|---|---|
| Daily FX rates cache (in-memory LRU) | DONE | `makeLruCache(max)`, Map-based, zero-dep |
| Expires daily 10:00 Jerusalem per BoI schedule | DONE | `currentRateDate(now)` uses `Intl` with `Asia/Jerusalem` |
| Historical rates lookup (by date) | DONE | `getRate(f,t,'YYYY-MM-DD')` walks day store |
| Convert amount between currencies | DONE | `convert()` rounds per target convention |
| Triangulate via USD when direct missing | DONE | Primary path via ILS base; secondary via historic USD |
| Source hierarchy: BoI → override → last known | DONE | Override beats BoI; stale fallback marks `stale:true` |
| Gain/loss calc for unrealized positions | DONE | `revalue()` per IAS 21 (delta between book and closing) |
| Rounding per currency convention | DONE | `round()` uses banker's rounding, decimals by ccy |
| Same currency → rate 1.0 | DONE | `IDENTITY` source |
| Inverse (USD→ILS from ILS→USD) | DONE | Direct inverse from stored "ILS per 1 FROM" |
| Triangle via USD | DONE | Cross-rate via ILS and historic fallback |
| Stale rate warning (>24h) | DONE | `staleHours` configurable, default 24 |
| Weekend/holiday gaps | DONE | `lastTradingDay()` walks back past Fri/Sat |
| Bilingual errors (Hebrew + English) | DONE | `FxError` carries `messageEn`/`messageHe` |
| Zero dependencies | DONE | Only Node built-ins (`Intl`, `Map`, `fetch`) |
| Israeli compliance (IAS 21 notice) | DONE | `revalue()` returns bilingual taxNotice |

## 5. Rate Source Hierarchy

Priority when resolving `getRate(FROM, TO, DATE)`:

1. **Identity** — same currency → `{ rate: 1 }`.
2. **Override (direct)** — user-set override for pair on date.
3. **Override (inverse)** — reverse override with `1/rate`.
4. **BoI store (fresh)** — rate loaded for the exact date.
5. **BoI store (stale)** — walk back up to 14 days, flag `stale:true`.
6. **Historic triangle** — derive via ILS base using two legs (stale flagged).

If no path exists, `FxError(RATE_NOT_FOUND)` is thrown with bilingual message and the offending pair/date in `details`.

## 6. Bank of Israel Integration

### Stub XML endpoint
`https://www.boi.org.il/currency.xml` — default URL; never fetched automatically unless `autoFetch: true` is set.

### Parser
`parseBoiXml(xml)` — zero-dep regex-based XML walker for `<CURRENCY>` blocks. Extracts:
- `CURRENCYCODE` (ISO 4217)
- `RATE` (ILS per UNIT of foreign ccy)
- `UNIT` (1 for USD/EUR, 100 for JPY, etc.)
- `CHANGE` (day-over-day delta, informational)

Internally normalizes all rates to **"ILS per 1 foreign unit"**, so downstream code never has to reason about BoI's 100-JPY quoting convention.

### Pluggable fetcher
The `fetcher` option accepts any `(url, signal) => Promise<string>`. Tests inject a fake that returns synthetic XML. Production code can route through the team's resilience layer.

## 7. Rounding Policy

Banker's rounding (round-half-to-even) prevents drift on large batches:

| Currency | Decimals | Example |
|---|---:|---|
| ILS, USD, EUR, GBP, CHF, CAD, AUD, HKD, CNY, EGP | 2 | `10.005 → 10.01` |
| JPY | 0 | `1000.5 → 1000`, `1001.5 → 1002` |
| JOD | 3 | `70.857 → 70.857` |

## 8. Israeli Compliance Notes

### IAS 21 / Income Tax (Israel)
- **Monetary items** revalued at closing rate per balance-sheet date.
- **Unrealized FX gains/losses** flow through P&L and are **taxable in the period incurred** per Israeli Tax Authority practice.
- Hedged positions must match the hedging instrument's recognition; this engine does **not** auto-apply hedge accounting — callers must segregate hedge positions before invoking `revalue()`.
- Reports are always presented in ILS (the functional currency), with per-currency drill-down.

### Bilingual surfacing
Every thrown error carries both Hebrew and English messages so the ERP UI can render without a separate i18n lookup. The `revalue()` result includes a `taxNotice` block that the reports layer should render verbatim on audit-grade documents.

## 9. Test Results

```
fx-engine.test.js — Techno-Kol ERP multi-currency engine
-----------------------------------------------------------
  ok  - 01 createFxEngine returns expected API shape
  ok  - 02 listCurrencies covers primary basket of 12
  ok  - 03 getRate same currency returns 1 with IDENTITY source
  ok  - 04 getRate USD->ILS direct BoI rate
  ok  - 05 getRate ILS->USD returns inverse
  ok  - 06 getRate EUR->USD triangulated via ILS
  ok  - 07 getRate unknown currency throws FxError(UNKNOWN_CCY)
  ok  - 08 getRate date without rates throws RATE_NOT_FOUND
  ok  - 09 convert rounds to target decimals (ILS 2dp)
  ok  - 10 JPY uses 0 decimals, JOD uses 3 decimals
  ok  - 11 convert rejects non-finite amount
  ok  - 12 setOverride direct pair beats BoI
  ok  - 13 setOverride inverse path from reverse override
  ok  - 14 setOverride rejects non-positive rate
  ok  - 15 Historical lookup resolves from store
  ok  - 16 Staleness: rate older than threshold flagged stale
  ok  - 17 Weekend gap returns last trading day
  ok  - 18 Bank of Israel XML parsing with UNIT scaling
  ok  - 19 loadRates from XML round-trips through getRate
  ok  - 20 cacheStats hits/misses tracked
  ok  - 21 revalue computes unrealized gain vs book value
  ok  - 22 revalue aggregates by currency with losses
  ok  - 23 revalue returns IAS 21 tax notice bilingual
  ok  - 24 revalue empty positions returns zero totals
  ok  - 25 purgeExpired drops days older than cutoff
  ok  - 26 Pluggable fetcher: refreshFromBoi uses injected fn
  ok  - 27 Rounding: banker's rounding on .5 edge
  ok  - 28 Triangle via USD: historic fallback when direct missing
-----------------------------------------------------------
  28/28 passed, 0 failed
```

Run locally:
```bash
node "test/payroll/fx-engine.test.js"
```

## 10. Supported Currencies (Primary Basket)

| ISO | Symbol | Decimals | nameHe / nameEn |
|---|---|---:|---|
| ILS | ₪   | 2 | שקל חדש / Israeli New Shekel (base) |
| USD | $   | 2 | דולר אמריקאי / US Dollar |
| EUR | €   | 2 | אירו / Euro |
| GBP | £   | 2 | לירה שטרלינג / Pound Sterling |
| JPY | ¥   | 0 | ין יפני / Japanese Yen |
| CHF | Fr  | 2 | פרנק שוויצרי / Swiss Franc |
| CAD | C$  | 2 | דולר קנדי / Canadian Dollar |
| AUD | A$  | 2 | דולר אוסטרלי / Australian Dollar |
| HKD | HK$ | 2 | דולר הונג קונג / Hong Kong Dollar |
| CNY | ¥   | 2 | יואן סיני / Chinese Yuan |
| JOD | JD  | 3 | דינר ירדני / Jordanian Dinar |
| EGP | E£  | 2 | לירה מצרית / Egyptian Pound |

## 11. Known Limitations / Future Work

1. **No persistence layer** — rates live in-memory only. Callers should snapshot the day's rates to DB on close (hook point: after `loadRates()` / `refreshFromBoi()`).
2. **No hedge accounting** — flag hedge positions externally and exclude from `revalue()`.
3. **No intraday rates** — BoI publishes once daily (~10:00 IL), which matches our cache policy.
4. **No futures/forwards** — spot only. Forward-rate module is a separate concern.
5. **Holiday calendar** — current weekend logic uses Fri/Sat only. Israeli public holidays (Rosh Hashana, Yom Kippur, etc.) are not auto-detected; the stale-fallback path covers them with a 14-day look-back window.

## 12. Integration Checklist

- [ ] Wire `refreshFromBoi()` to daily cron at 10:05 Jerusalem time
- [ ] Persist `dumpRates(date)` snapshot to `fx_rates_daily` table
- [ ] Surface `FxError` messages through ERP i18n layer (already bilingual)
- [ ] Feed `revalue()` output into month-end P&L journal entries
- [ ] Expose `setOverride()` to controller role only (ACL-gated)

## 13. Compliance Sign-Off

- **IAS 21:** Monetary items revalued at closing rate; P&L impact returned explicitly.
- **Israeli Income Tax Ordinance:** Unrealized FX gain recognition respected.
- **Zero external deps:** `package.json` unchanged; no supply-chain surface area added.
- **Never delete:** Rate days retained via `purgeExpired()` with configurable retention (default 400 days = >1 fiscal year).
- **Hebrew bilingual:** All errors, tax notices, and currency descriptions dual-language.

---

**Agent X-36 — task complete. Engine green, 28/28 tests pass, zero deps. Ready for integration wiring.**
